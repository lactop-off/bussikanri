"""カテゴリ / 保管場所マスタ。階層対応。設計書 FR-2.5 / §9.2。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, require_manager
from ..models import Category, Location, User
from ..schemas import MasterCreate, MasterOut

router = APIRouter(tags=["masters"])


def _build(model, prefix: str, label: str):
    sub = APIRouter(prefix=prefix)

    @sub.get("", response_model=list[MasterOut])
    def list_items(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
        return list(db.scalars(select(model).order_by(model.name)).all())

    @sub.post("", response_model=MasterOut, status_code=status.HTTP_201_CREATED)
    def create_item(body: MasterCreate, db: Session = Depends(get_db), _: User = Depends(require_manager)):
        if body.parent_id and not db.get(model, body.parent_id):
            raise HTTPException(status_code=404, detail={"code": "PARENT_NOT_FOUND", "message": f"親{label}が見つかりません"})
        item = model(name=body.name, parent_id=body.parent_id)
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    return sub


router.include_router(_build(Category, "/categories", "カテゴリ"))
router.include_router(_build(Location, "/locations", "保管場所"))
