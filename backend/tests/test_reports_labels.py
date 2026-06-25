def _asset(client, manager, name="PC", tag=None):
    body = {"name": name}
    if tag:
        body["asset_tag"] = tag
    return client.post("/api/v1/assets", headers=manager, json=body).json()


def test_assets_csv_export_has_bom(client, manager):
    _asset(client, manager, "ノートPC", "R-1")
    resp = client.get("/api/v1/reports/assets.csv", headers=manager)
    assert resp.status_code == 200
    assert resp.content[:3] == b"\xef\xbb\xbf"  # UTF-8 BOM (Excel互換)
    text = resp.content.decode("utf-8-sig")
    assert "asset_tag" in text.splitlines()[0]
    assert "R-1" in text


def test_loans_csv_export(client, manager, member):
    a = _asset(client, manager, "カメラ", "R-2")
    client.post(f"/api/v1/assets/{a['id']}/checkout", headers=member, json={"borrower_id": "self"})
    resp = client.get("/api/v1/reports/loans.csv", headers=manager)
    assert resp.status_code == 200
    assert "R-2" in resp.content.decode("utf-8-sig")


def test_csv_export_member_forbidden(client, member):
    assert client.get("/api/v1/reports/assets.csv", headers=member).status_code == 403


def test_label_pdf(client, manager):
    a = _asset(client, manager, "工具", "R-3")
    resp = client.post("/api/v1/labels", headers=manager, json={"asset_ids": [a["id"]], "layout": "a-one-65"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"


def test_label_unknown_layout(client, manager):
    a = _asset(client, manager, "x", "R-4")
    resp = client.post("/api/v1/labels", headers=manager, json={"asset_ids": [a["id"]], "layout": "nope"})
    assert resp.status_code == 400


def test_loan_history_by_asset(client, manager, member):
    a = _asset(client, manager, "PC", "R-5")
    client.post(f"/api/v1/assets/{a['id']}/checkout", headers=member, json={"borrower_id": "self"})
    client.post(f"/api/v1/assets/{a['id']}/checkin", headers=member, json={})
    client.post(f"/api/v1/assets/{a['id']}/checkout", headers=member, json={"borrower_id": "self"})
    # manager は asset_id 指定で全履歴（返却済+貸出中）を参照できる（AssetDetail が依存）。
    resp = client.get(f"/api/v1/loans?scope=all&asset_id={a['id']}", headers=manager)
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


def test_csv_import_roundtrip(client, manager):
    import io

    data = "asset_tag,name,category,home_location\nIMP-9,輸入PC,PC,倉庫\n"
    resp = client.post(
        "/api/v1/imports/assets",
        headers=manager,
        files={"file": ("a.csv", io.BytesIO(data.encode()), "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["created"] == 1
    # 取り込んだ資産が検索できる
    look = client.get("/api/v1/assets/lookup", headers=manager, params={"tag": "IMP-9"})
    assert look.status_code == 200
