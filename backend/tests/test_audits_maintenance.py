def _asset(client, manager, name, tag):
    return client.post("/api/v1/assets", headers=manager, json={"name": name, "asset_tag": tag}).json()


def test_audit_flow(client, manager):
    a1 = _asset(client, manager, "PC1", "T-1")
    a2 = _asset(client, manager, "PC2", "T-2")
    _asset(client, manager, "PC3", "T-3")  # スキャンしない → 欠品になる想定

    audit = client.post("/api/v1/audits", headers=manager, json={"name": "全体棚卸", "scope": "all"})
    assert audit.status_code == 201
    aid = audit.json()["id"]

    # 2件スキャン
    scan = client.post(f"/api/v1/audits/{aid}/scan", headers=manager, json={"tags": ["T-1", "T-2"]})
    assert scan.status_code == 200
    assert scan.json()["found"] == 2

    # 締める → T-3 が欠品
    close = client.post(f"/api/v1/audits/{aid}/close", headers=manager, json={})
    assert close.status_code == 200
    rep = close.json()
    assert rep["found"] == 2
    assert rep["missing"] == 1
    assert rep["audit"]["status"] == "closed"

    # 締めた後はスキャン不可
    again = client.post(f"/api/v1/audits/{aid}/scan", headers=manager, json={"tags": ["T-1"]})
    assert again.status_code == 409


def test_audit_member_forbidden(client, manager, member):
    audit = client.post("/api/v1/audits", headers=manager, json={"name": "x", "scope": "all"}).json()
    assert client.post(f"/api/v1/audits/{audit['id']}/scan", headers=member, json={"tags": []}).status_code == 403


def test_maintenance_blocks_checkout(client, manager, member):
    asset = _asset(client, manager, "工具", "M-1")
    # メンテ受付
    rec = client.post(
        "/api/v1/maintenance", headers=manager, json={"asset_id": asset["id"], "type": "repair"}
    )
    assert rec.status_code == 201

    # 資産はメンテ中 → 貸出不可
    co = client.post(f"/api/v1/assets/{asset['id']}/checkout", headers=member, json={"borrower_id": "self"})
    assert co.status_code == 409
    assert co.json()["error"]["code"] == "ASSET_NOT_AVAILABLE"

    # 完了 → 利用可に戻る
    done = client.patch(f"/api/v1/maintenance/{rec.json()['id']}", headers=manager, json={"status": "done"})
    assert done.status_code == 200
    look = client.get("/api/v1/assets/lookup", headers=member, params={"tag": "M-1"})
    assert look.json()["status"] == "available"


def test_checkin_to_maintenance(client, manager, member):
    asset = _asset(client, manager, "カメラ", "C-1")
    client.post(f"/api/v1/assets/{asset['id']}/checkout", headers=member, json={"borrower_id": "self"})
    ci = client.post(
        f"/api/v1/assets/{asset['id']}/checkin", headers=member, json={"to_maintenance": True}
    )
    assert ci.status_code == 200
    look = client.get("/api/v1/assets/lookup", headers=member, params={"tag": "C-1"})
    assert look.json()["status"] == "under_maintenance"


def test_dashboard(client, manager, member):
    a = _asset(client, manager, "PC", "D-1")
    client.post(f"/api/v1/assets/{a['id']}/checkout", headers=member, json={"borrower_id": "self"})
    dash = client.get("/api/v1/dashboard", headers=member).json()
    assert dash["total_assets"] == 1
    assert dash["checked_out"] == 1
    assert dash["my_open_loans"] == 1
