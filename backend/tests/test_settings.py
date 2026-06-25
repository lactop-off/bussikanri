from datetime import timedelta

from app.db import SessionLocal
from app.models import Loan, LoanStatus, Notification, utcnow


def test_get_settings_defaults(client, member):
    s = client.get("/api/v1/settings", headers=member).json()
    assert s["default_loan_days"] == 14
    assert s["asset_tag_prefix"] == "KRD-"
    assert "{asset}" in s["reminder_due_template"]


def test_patch_settings_admin_only(client, manager):
    assert client.patch("/api/v1/settings", headers=manager, json={"default_loan_days": 7}).status_code == 403


def test_patch_settings_affects_checkout(client, admin, manager, member):
    # 既定貸出日数を 7 に変更
    r = client.patch("/api/v1/settings", headers=admin, json={"default_loan_days": 7})
    assert r.status_code == 200
    assert r.json()["default_loan_days"] == 7

    asset = client.post("/api/v1/assets", headers=manager, json={"name": "PC", "asset_tag": "S-1"}).json()
    loan = client.post(f"/api/v1/assets/{asset['id']}/checkout", headers=member, json={"borrower_id": "self"}).json()
    days = (
        __import__("datetime").datetime.fromisoformat(loan["due_at"]).date()
        - __import__("datetime").datetime.fromisoformat(loan["checkout_at"]).date()
    ).days
    assert days == 7


def test_settings_prefix_affects_auto_tag(client, admin, manager):
    client.patch("/api/v1/settings", headers=admin, json={"asset_tag_prefix": "ABC-"})
    a = client.post("/api/v1/assets", headers=manager, json={"name": "x"}).json()
    assert a["asset_tag"].startswith("ABC-")


def test_reminder_uses_custom_template(client, admin, manager, member):
    client.patch(
        "/api/v1/settings",
        headers=admin,
        json={"reminder_overdue_template": "【至急】{asset} を返してください"},
    )
    asset = client.post("/api/v1/assets", headers=manager, json={"name": "プロジェクタ", "asset_tag": "S-9"}).json()
    member_id = client.get("/api/v1/auth/me", headers=member).json()["id"]
    client.post(f"/api/v1/assets/{asset['id']}/checkout", headers=member, json={"borrower_id": "self"})

    # 期限を過去にして超過させる
    with SessionLocal() as db:
        ln = db.scalar(__import__("sqlalchemy").select(Loan).where(Loan.status == LoanStatus.open))
        ln.due_at = utcnow() - timedelta(days=2)
        db.commit()

    from app.worker import run_reminders

    res = run_reminders()
    assert res["overdue"] == 1
    with SessionLocal() as db:
        n = db.scalar(__import__("sqlalchemy").select(Notification).where(Notification.user_id == member_id))
        assert "至急" in n.payload
        assert "プロジェクタ" in n.payload
