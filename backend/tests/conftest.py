"""テスト共通フィクスチャ。SQLite インメモリで完結。"""

from __future__ import annotations

import os
import tempfile

import pytest

# テスト用にファイルベース SQLite を指定（複数接続で共有するため）。
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{_tmp.name}"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["DEFAULT_LOAN_DAYS"] = "14"

from fastapi.testclient import TestClient  # noqa: E402

from app.bootstrap import init_db  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    init_db()
    yield
    Base.metadata.drop_all(bind=engine)


def _make_user(email: str, role: Role, password: str = "password123") -> str:
    with SessionLocal() as db:
        u = User(email=email, name=email.split("@")[0], role=role, password_hash=hash_password(password))
        db.add(u)
        db.commit()
        db.refresh(u)
        return u.id


@pytest.fixture
def client():
    return TestClient(app)


def _token(client: TestClient, email: str, password: str = "password123") -> str:
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin(client):
    _make_user("admin@example.com", Role.admin)
    return _auth(_token(client, "admin@example.com"))


@pytest.fixture
def manager(client):
    _make_user("manager@example.com", Role.manager)
    return _auth(_token(client, "manager@example.com"))


@pytest.fixture
def member(client):
    _make_user("member@example.com", Role.member)
    return _auth(_token(client, "member@example.com"))


@pytest.fixture
def member2(client):
    _make_user("member2@example.com", Role.member)
    return _auth(_token(client, "member2@example.com"))
