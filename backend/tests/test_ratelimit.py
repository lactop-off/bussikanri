from app.services import ratelimit


def test_login_rate_limit(client):
    from tests.conftest import _make_user
    from app.models import Role

    _make_user("rl@example.com", Role.member)
    # 既定上限は 10 回/5分。誤パスワードで上限まで叩く。
    codes = []
    for _ in range(12):
        r = client.post("/api/v1/auth/login", json={"email": "rl@example.com", "password": "wrong"})
        codes.append(r.status_code)
    # どこかで 429 に切り替わる
    assert 429 in codes
    assert codes[-1] == 429


def test_rate_limit_unit():
    ratelimit.reset()
    key = "unit:test"
    # 5回までは許可、6回目で超過（max=5）
    results = [ratelimit.check(key, max_attempts=5, now=t) for t in range(6)]
    assert results == [True, True, True, True, True, False]


def test_rate_limit_window_expiry():
    ratelimit.reset()
    key = "unit:window"
    for t in range(5):
        assert ratelimit.check(key, max_attempts=5, window=100, now=t) is True
    # ウィンドウ(100)を超えた時刻なら再び許可される
    assert ratelimit.check(key, max_attempts=5, window=100, now=1000) is True
