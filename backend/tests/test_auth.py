def test_login_and_me(client, member):
    resp = client.get("/api/v1/auth/me", headers=member)
    assert resp.status_code == 200
    assert resp.json()["email"] == "member@example.com"
    assert resp.json()["role"] == "member"


def test_login_wrong_password(client):
    from tests.conftest import _make_user
    from app.models import Role

    _make_user("x@example.com", Role.member)
    resp = client.post("/api/v1/auth/login", json={"email": "x@example.com", "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_refresh(client):
    from tests.conftest import _make_user
    from app.models import Role

    _make_user("r@example.com", Role.member)
    login = client.post("/api/v1/auth/login", json={"email": "r@example.com", "password": "password123"})
    refresh = login.json()["refresh_token"]
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_unauthenticated_rejected(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_member_cannot_list_users(client, member):
    assert client.get("/api/v1/users", headers=member).status_code == 403


def test_admin_creates_user(client, admin):
    resp = client.post(
        "/api/v1/users",
        headers=admin,
        json={"email": "new@example.com", "name": "新人", "password": "password123", "role": "member"},
    )
    assert resp.status_code == 201
    assert resp.json()["email"] == "new@example.com"
