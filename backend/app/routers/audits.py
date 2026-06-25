"""棚卸 (Audit)。現物スキャンで台帳と自動照合。設計書 FR-5 / §9.2 /audits。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_manager
from ..models import (
    Asset,
    AssetStatus,
    Audit,
    AuditItem,
    AuditResult,
    AuditScope,
    AuditStatus,
    User,
    utcnow,
)
from ..schemas import AuditCreate, AuditItemOut, AuditOut, AuditReport, AuditScanRequest
from ..services import audit_log

router = APIRouter(prefix="/audits", tags=["audits"])


def _scope_assets(db: Session, audit: Audit) -> list[Asset]:
    """棚卸対象（台帳側の母集合）を返す。廃棄済みは除外。"""
    stmt = select(Asset).where(Asset.status != AssetStatus.retired)
    if audit.scope == AuditScope.category:
        stmt = stmt.where(Asset.category_id == audit.scope_ref_id)
    elif audit.scope == AuditScope.location:
        stmt = stmt.where(Asset.home_location_id == audit.scope_ref_id)
    return list(db.scalars(stmt).all())


@router.get("", response_model=list[AuditOut])
def list_audits(db: Session = Depends(get_db), _: User = Depends(require_manager)):
    return list(db.scalars(select(Audit).order_by(Audit.started_at.desc())).all())


@router.post("", response_model=AuditOut, status_code=status.HTTP_201_CREATED)
def create_audit(body: AuditCreate, db: Session = Depends(get_db), actor: User = Depends(require_manager)):
    audit = Audit(name=body.name, scope=body.scope, scope_ref_id=body.scope_ref_id, created_by=actor.id)
    db.add(audit)
    db.flush()
    audit_log.record(db, actor_id=actor.id, entity_type="audit", entity_id=audit.id, action="open",
                     after={"name": audit.name, "scope": audit.scope.value})
    db.commit()
    db.refresh(audit)
    return audit


@router.post("/{audit_id}/scan", response_model=AuditReport)
def scan(audit_id: str, body: AuditScanRequest, db: Session = Depends(get_db), actor: User = Depends(require_manager)):
    """スキャンしたタグを「発見」として記録する（複数可 / FR-5.2）。オフライン分の一括同期にも対応。"""
    audit = db.get(Audit, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "棚卸が見つかりません"})
    if audit.status == AuditStatus.closed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail={"code": "AUDIT_CLOSED", "message": "この棚卸は既に締められています"})

    scope_ids = {a.id for a in _scope_assets(db, audit)}
    existing = {it.asset_id: it for it in db.scalars(select(AuditItem).where(AuditItem.audit_id == audit_id)).all()}

    for tag in body.tags:
        asset = db.scalar(select(Asset).where(Asset.asset_tag == tag))
        if not asset:
            continue  # 未知タグはスキップ（手入力ミス等）
        # 対象範囲内なら found、範囲外なら unexpected（別場所からの混入 / FR-5.3）。
        result = AuditResult.found if asset.id in scope_ids else AuditResult.unexpected
        item = existing.get(asset.id)
        if item:
            item.result = result
            item.scanned_at = utcnow()
            item.scanned_by = actor.id
        else:
            item = AuditItem(audit_id=audit_id, asset_id=asset.id, result=result,
                             scanned_at=utcnow(), scanned_by=actor.id)
            db.add(item)
            existing[asset.id] = item

    db.commit()
    return _report(db, audit)


@router.post("/{audit_id}/close", response_model=AuditReport)
def close(audit_id: str, db: Session = Depends(get_db), actor: User = Depends(require_manager)):
    """棚卸を締め、未スキャンの対象資産を欠品(missing)として確定する（FR-5.4）。"""
    audit = db.get(Audit, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "棚卸が見つかりません"})
    if audit.status == AuditStatus.closed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail={"code": "AUDIT_CLOSED", "message": "この棚卸は既に締められています"})

    scanned_ids = {it.asset_id for it in db.scalars(select(AuditItem).where(AuditItem.audit_id == audit_id)).all()}
    for asset in _scope_assets(db, audit):
        if asset.id not in scanned_ids:
            db.add(AuditItem(audit_id=audit_id, asset_id=asset.id, result=AuditResult.missing))

    audit.status = AuditStatus.closed
    audit.closed_at = utcnow()
    audit_log.record(db, actor_id=actor.id, entity_type="audit", entity_id=audit.id, action="close")
    db.commit()
    return _report(db, audit)


@router.get("/{audit_id}", response_model=AuditReport)
def get_audit(audit_id: str, db: Session = Depends(get_db), _: User = Depends(require_manager)):
    audit = db.get(Audit, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "棚卸が見つかりません"})
    return _report(db, audit)


def _report(db: Session, audit: Audit) -> AuditReport:
    items = list(db.scalars(select(AuditItem).where(AuditItem.audit_id == audit.id)).all())
    counts = {r: 0 for r in AuditResult}
    for it in items:
        counts[it.result] += 1
    return AuditReport(
        audit=AuditOut.model_validate(audit),
        found=counts[AuditResult.found],
        missing=counts[AuditResult.missing],
        unexpected=counts[AuditResult.unexpected],
        items=[AuditItemOut.model_validate(it) for it in items],
    )
