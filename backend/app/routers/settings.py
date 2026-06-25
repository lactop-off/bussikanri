"""アプリ設定の参照・更新。設計書 FR-6.3 / 付録B / APP_SETTINGS。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, require_admin
from ..models import User
from ..schemas import SettingsOut, SettingsUpdate
from ..services import audit_log, settings_store

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_app_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    # 参照は全員（既定貸出日数やプレフィックスをフォームで使うため）。
    return settings_store.get_row(db)


@router.patch("", response_model=SettingsOut)
def update_app_settings(
    body: SettingsUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin),
):
    row = settings_store.get_row(db)
    before = {
        "default_loan_days": row.default_loan_days,
        "reminder_cron": row.reminder_cron,
        "asset_tag_prefix": row.asset_tag_prefix,
    }
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    audit_log.record(
        db, actor_id=actor.id, entity_type="settings", entity_id="1", action="update",
        before=before, after=body.model_dump(exclude_unset=True),
    )
    db.commit()
    db.refresh(row)
    return row
