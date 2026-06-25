"""ユーザー管理。admin のみ。設計書 FR-1.3 / §9.2 /users。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_admin
from ..models import User
from ..schemas import UserCreate, UserOut, UserPage, UserUpdate
from ..security import hash_password
from ..services import audit_log

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=UserPage)
def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserPage:
    total = db.scalar(select(func.count()).select_from(User)) or 0
    rows = db.scalars(
        select(User).order_by(User.created_at).offset((page - 1) * size).limit(size)
    ).all()
    return UserPage(total=total, page=page, size=size, items=list(rows))


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> User:
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EMAIL_TAKEN", "message": "このメールアドレスは既に使用されています"},
        )
    user = User(
        email=body.email,
        name=body.name,
        employee_code=body.employee_code,
        department=body.department,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    audit_log.record(
        db, actor_id=actor.id, entity_type="user", entity_id=user.id, action="create",
        after={"email": user.email, "role": user.role.value},
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "ユーザーが見つかりません"})
    before = {"role": user.role.value, "is_active": user.is_active}
    data = body.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        user.password_hash = hash_password(data.pop("password"))
    else:
        data.pop("password", None)
    for k, v in data.items():
        setattr(user, k, v)
    audit_log.record(
        db, actor_id=actor.id, entity_type="user", entity_id=user.id, action="update",
        before=before, after={"role": user.role.value, "is_active": user.is_active},
    )
    db.commit()
    db.refresh(user)
    return user
