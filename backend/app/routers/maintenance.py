"""メンテナンス / 修理履歴。設計書 FR-7 / §9.2 /maintenance。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_manager
from ..models import (
    Asset,
    AssetStatus,
    MaintenanceRecord,
    MaintenanceStatus,
    User,
    utcnow,
)
from ..schemas import MaintenanceCreate, MaintenanceOut, MaintenanceUpdate
from ..services import audit_log

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


@router.get("", response_model=list[MaintenanceOut])
def list_maintenance(
    asset_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    stmt = select(MaintenanceRecord).order_by(MaintenanceRecord.reported_at.desc())
    if asset_id:
        stmt = stmt.where(MaintenanceRecord.asset_id == asset_id)
    return list(db.scalars(stmt).all())


@router.post("", response_model=MaintenanceOut, status_code=status.HTTP_201_CREATED)
def create_maintenance(
    body: MaintenanceCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
):
    asset = db.get(Asset, body.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "資産が見つかりません"})
    if asset.status == AssetStatus.checked_out:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ASSET_CHECKED_OUT", "message": "貸出中の資産はメンテ受付できません。先に返却してください"},
        )
    rec = MaintenanceRecord(
        asset_id=body.asset_id,
        type=body.type,
        reported_at=body.reported_at or utcnow().date(),
        started_at=body.started_at,
        completed_at=body.completed_at,
        cost=body.cost,
        vendor=body.vendor,
        performed_by=actor.id,
        description=body.description,
        status=MaintenanceStatus.open,
    )
    # 受付中は資産を「メンテ中」にし貸出不可とする（FR-7.3）。
    if asset.status == AssetStatus.available:
        asset.status = AssetStatus.under_maintenance
    db.add(rec)
    db.flush()
    audit_log.record(
        db, actor_id=actor.id, entity_type="maintenance", entity_id=rec.id, action="open",
        after={"asset_tag": asset.asset_tag, "type": rec.type.value},
    )
    db.commit()
    db.refresh(rec)
    return rec


@router.patch("/{rec_id}", response_model=MaintenanceOut)
def update_maintenance(
    rec_id: str,
    body: MaintenanceUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
):
    rec = db.get(MaintenanceRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "メンテ記録が見つかりません"})
    before = {"status": rec.status.value}
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(rec, k, v)
    # 完了したら資産を利用可へ戻す（FR-7 / UC-5）。
    if rec.status == MaintenanceStatus.done:
        if not rec.completed_at:
            rec.completed_at = utcnow().date()
        asset = db.get(Asset, rec.asset_id)
        if asset and asset.status == AssetStatus.under_maintenance:
            asset.status = AssetStatus.available
    audit_log.record(
        db, actor_id=actor.id, entity_type="maintenance", entity_id=rec.id, action="update",
        before=before, after={"status": rec.status.value},
    )
    db.commit()
    db.refresh(rec)
    return rec
