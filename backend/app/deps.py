"""共通依存性: 認証・認可 (RBAC)。設計書 §11。"""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Role, User
from .security import ACCESS, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

_ROLE_RANK = {Role.member: 0, Role.manager: 1, Role.admin: 2}


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    cred_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "UNAUTHORIZED", "message": "認証が必要です"},
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise cred_error
    payload = decode_token(token)
    if not payload or payload.get("type") != ACCESS:
        raise cred_error
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise cred_error
    return user


def require_role(min_role: Role) -> Callable[..., User]:
    """min_role 以上の権限を要求する依存性ファクトリ。"""

    def checker(user: User = Depends(get_current_user)) -> User:
        if _ROLE_RANK[user.role] < _ROLE_RANK[min_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "権限がありません"},
            )
        return user

    return checker


require_manager = require_role(Role.manager)
require_admin = require_role(Role.admin)
