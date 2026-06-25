def _create_asset(client, manager, name="ノートPC", tag=None):
    body = {"name": name}
    if tag:
        body["asset_tag"] = tag
    resp = client.post("/api/v1/assets", headers=manager, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_auto_tag_numbering(client, manager):
    a1 = _create_asset(client, manager)
    a2 = _create_asset(client, manager)
    assert a1["asset_tag"] == "KRD-000001"
    assert a2["asset_tag"] == "KRD-000002"


def test_member_cannot_create_asset(client, member):
    resp = client.post("/api/v1/assets", headers=member, json={"name": "x"})
    assert resp.status_code == 403


def test_lookup(client, manager, member):
    asset = _create_asset(client, manager, tag="KRD-ABC")
    resp = client.get("/api/v1/assets/lookup", headers=member, params={"tag": "KRD-ABC"})
    assert resp.status_code == 200
    assert resp.json()["id"] == asset["id"]
    assert resp.json()["current_loan"] is None


def test_lookup_not_found(client, member):
    resp = client.get("/api/v1/assets/lookup", headers=member, params={"tag": "NOPE"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "ASSET_NOT_FOUND"


def test_self_checkout_and_checkin(client, manager, member):
    asset = _create_asset(client, manager)
    # 自己貸出
    co = client.post(f"/api/v1/assets/{asset['id']}/checkout", headers=member, json={"borrower_id": "self"})
    assert co.status_code == 201, co.text
    assert co.json()["status"] == "open"

    # 資産は貸出中
    look = client.get("/api/v1/assets/lookup", headers=member, params={"tag": asset["asset_tag"]})
    assert look.json()["status"] == "checked_out"
    assert look.json()["current_loan"]["borrower"]["name"] == "member"

    # 返却
    ci = client.post(f"/api/v1/assets/{asset['id']}/checkin", headers=member, json={})
    assert ci.status_code == 200
    assert ci.json()["status"] == "returned"

    look2 = client.get("/api/v1/assets/lookup", headers=member, params={"tag": asset["asset_tag"]})
    assert look2.json()["status"] == "available"


def test_double_checkout_blocked(client, manager, member, member2):
    asset = _create_asset(client, manager)
    client.post(f"/api/v1/assets/{asset['id']}/checkout", headers=member, json={"borrower_id": "self"})
    resp = client.post(f"/api/v1/assets/{asset['id']}/checkout", headers=member2, json={"borrower_id": "self"})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "ASSET_ALREADY_CHECKED_OUT"


def test_member_cannot_proxy_checkout(client, manager, member, member2):
    asset = _create_asset(client, manager)
    # member が他人(member2)名義で借りようとする → 403
    other_id = client.get("/api/v1/auth/me", headers=member2).json()["id"]
    resp = client.post(
        f"/api/v1/assets/{asset['id']}/checkout", headers=member, json={"borrower_id": other_id}
    )
    assert resp.status_code == 403


def test_manager_proxy_checkout(client, manager, member):
    asset = _create_asset(client, manager)
    member_id = client.get("/api/v1/auth/me", headers=member).json()["id"]
    resp = client.post(
        f"/api/v1/assets/{asset['id']}/checkout", headers=manager, json={"borrower_id": member_id}
    )
    assert resp.status_code == 201
    assert resp.json()["borrower"]["name"] == "member"


def test_loans_scope(client, manager, member):
    asset = _create_asset(client, manager)
    client.post(f"/api/v1/assets/{asset['id']}/checkout", headers=member, json={"borrower_id": "self"})
    # member は自分の貸出が見える
    mine = client.get("/api/v1/loans", headers=member)
    assert mine.json()["total"] == 1
    # manager は scope=all で全体が見える
    all_loans = client.get("/api/v1/loans", headers=manager, params={"scope": "all"})
    assert all_loans.json()["total"] == 1


def test_checkin_not_checked_out(client, manager, member):
    asset = _create_asset(client, manager)
    resp = client.post(f"/api/v1/assets/{asset['id']}/checkin", headers=member, json={})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "ASSET_NOT_CHECKED_OUT"
