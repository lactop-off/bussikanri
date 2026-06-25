from app.db import SessionLocal
from app.models import Notification, NotificationChannel, NotificationType


def _seed_notification(user_id: str, channel=NotificationChannel.in_app):
    with SessionLocal() as db:
        n = Notification(user_id=user_id, type=NotificationType.due_soon, payload="期限が近づいています", channel=channel)
        db.add(n)
        db.commit()
        db.refresh(n)
        return n.id


def test_notifications_list_and_mark_read(client, member):
    uid = client.get("/api/v1/auth/me", headers=member).json()["id"]
    nid = _seed_notification(uid)

    lst = client.get("/api/v1/notifications", headers=member)
    assert lst.status_code == 200
    assert len(lst.json()) == 1
    assert lst.json()[0]["read_at"] is None

    # 未読のみ
    assert len(client.get("/api/v1/notifications?unread_only=true", headers=member).json()) == 1

    # 既読化
    r = client.post(f"/api/v1/notifications/{nid}/read", headers=member)
    assert r.status_code == 200
    assert r.json()["read_at"] is not None
    assert len(client.get("/api/v1/notifications?unread_only=true", headers=member).json()) == 0


def test_notifications_email_channel_hidden(client, member):
    uid = client.get("/api/v1/auth/me", headers=member).json()["id"]
    _seed_notification(uid, channel=NotificationChannel.email)
    # メール配信記録は一覧に出ない
    assert client.get("/api/v1/notifications", headers=member).json() == []


def test_mark_all_read(client, member):
    uid = client.get("/api/v1/auth/me", headers=member).json()["id"]
    _seed_notification(uid)
    _seed_notification(uid)
    client.post("/api/v1/notifications/read-all", headers=member)
    assert client.get("/api/v1/notifications?unread_only=true", headers=member).json() == []


def test_cannot_read_others_notification(client, member, member2):
    uid = client.get("/api/v1/auth/me", headers=member).json()["id"]
    nid = _seed_notification(uid)
    assert client.post(f"/api/v1/notifications/{nid}/read", headers=member2).status_code == 404


def test_audit_csv_export(client, manager):
    a = client.post("/api/v1/assets", headers=manager, json={"name": "PC", "asset_tag": "AU-1"}).json()
    audit = client.post("/api/v1/audits", headers=manager, json={"name": "棚卸", "scope": "all"}).json()
    client.post(f"/api/v1/audits/{audit['id']}/scan", headers=manager, json={"tags": ["AU-1"]})
    client.post(f"/api/v1/audits/{audit['id']}/close", headers=manager, json={})

    resp = client.get(f"/api/v1/reports/audit.csv?audit_id={audit['id']}", headers=manager)
    assert resp.status_code == 200
    text = resp.content.decode("utf-8-sig")
    assert "result" in text.splitlines()[0]
    assert "AU-1" in text
    assert "発見" in text


def test_audit_csv_requires_id(client, manager):
    assert client.get("/api/v1/reports/audit.csv", headers=manager).status_code == 400


def test_activity_csv_export(client, manager):
    client.post("/api/v1/assets", headers=manager, json={"name": "PC", "asset_tag": "AC-1"})
    resp = client.get("/api/v1/reports/activity.csv", headers=manager)
    assert resp.status_code == 200
    text = resp.content.decode("utf-8-sig")
    assert "action" in text.splitlines()[0]
    assert "create" in text


def test_mailer_not_configured(monkeypatch):
    # SMTP 未設定なら送信は False を返し、例外を投げない。
    from app.services import mailer

    assert mailer.is_configured() is False
    assert mailer.send_mail("x@example.com", "s", "b") is False
