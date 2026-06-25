"""資産マスタ + 貸出/返却。設計書 FR-2 / FR-3 / §9。"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user, require_manager
from ..models import (
    Asset,
    AssetStatus,
    Loan,
    LoanStatus,
    MaintenanceRecord,
    MaintenanceStatus,
    MaintenanceType,
    Role,
    User,
    utcnow,
)
from ..schemas import (
    AssetCreate,
    AssetLookup,
    AssetOut,
    AssetPage,
    AssetUpdate,
    CheckinRequest,
    CheckoutRequest,
    LoanOut,
)
from ..services import audit_log

router = APIRouter(prefix="/assets", tags=["assets"])
settings = get_settings()


def _generate_asset_tag(db: Session) -> str:
    """プレフィックス + 6桁連番で asset_tag を自動採番する（設計書 FR-2.3 / 付録B）。"""
    prefix = settings.asset_tag_prefix
    like = f"{prefix}%"
    max_seq = 0
    for (tag,) in db.execute(select(Asset.asset_tag).where(Asset.asset_tag.like(like))):
        suffix = tag[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))
    return f"{prefix}{max_seq + 1:06d}"


def _current_open_loan(db: Session, asset_id: str) -> Loan | None:
    return db.scalar(
        select(Loan).where(Loan.asset_id == asset_id, Loan.status == LoanStatus.open)
    )


# ---- マスタ CRUD ----------------------------------------------------------


@router.get("", response_model=AssetPage)
def list_assets(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    q: str | None = Query(None, description="名称/管理番号/型番の部分一致"),
    status_filter: AssetStatus | None = Query(None, alias="status"),
    category_id: str | None = None,
    location_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AssetPage:
    stmt = select(Asset)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(Asset.name.ilike(like), Asset.asset_tag.ilike(like), Asset.model.ilike(like))
        )
    if status_filter:
        stmt = stmt.where(Asset.status == status_filter)
    if category_id:
        stmt = stmt.where(Asset.category_id == category_id)
    if location_id:
        stmt = stmt.where(Asset.home_location_id == location_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Asset.asset_tag).offset((page - 1) * size).limit(size)
    ).all()
    return AssetPage(total=total, page=page, size=size, items=list(rows))


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    body: AssetCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> Asset:
    tag = body.asset_tag or _generate_asset_tag(db)
    if db.scalar(select(Asset).where(Asset.asset_tag == tag)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ASSET_TAG_TAKEN", "message": f"管理番号 {tag} は既に使用されています"},
        )
    data = body.model_dump(exclude={"asset_tag"})
    asset = Asset(asset_tag=tag, **data)
    db.add(asset)
    db.flush()
    audit_log.record(
        db, actor_id=actor.id, entity_type="asset", entity_id=asset.id, action="create",
        after={"asset_tag": asset.asset_tag, "name": asset.name},
    )
    db.commit()
    db.refresh(asset)
    return asset


@router.get("/lookup", response_model=AssetLookup)
def lookup_asset(
    tag: str = Query(..., description="QR/バーコードの値 (asset_tag)"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AssetLookup:
    """スキャンの中核: タグから資産を即時特定する（設計書 FR-2.6 / §9.3）。"""
    asset = db.scalar(select(Asset).where(Asset.asset_tag == tag))
    if not asset:
        raise HTTPException(
            status_code=404,
            detail={"code": "ASSET_NOT_FOUND", "message": f"管理番号 {tag} の資産が見つかりません"},
        )
    out = AssetLookup.model_validate(asset)
    out.current_loan = _current_open_loan(db, asset.id)  # type: ignore[assignment]
    return out


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "資産が見つかりません"})
    return asset


@router.patch("/{asset_id}", response_model=AssetOut)
def update_asset(
    asset_id: str,
    body: AssetUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "資産が見つかりません"})
    before = {"status": asset.status.value, "name": asset.name}
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(asset, k, v)
    audit_log.record(
        db, actor_id=actor.id, entity_type="asset", entity_id=asset.id, action="update",
        before=before, after={"status": asset.status.value, "name": asset.name},
    )
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{asset_id}", response_model=AssetOut)
def retire_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> Asset:
    """論理削除（廃棄）。物理削除はしない（履歴保持）。"""
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "資産が見つかりません"})
    if asset.status == AssetStatus.checked_out:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ASSET_CHECKED_OUT", "message": "貸出中の資産は廃棄できません。先に返却してください"},
        )
    before = {"status": asset.status.value}
    asset.status = AssetStatus.retired
    audit_log.record(
        db, actor_id=actor.id, entity_type="asset", entity_id=asset.id, action="retire", before=before,
        after={"status": asset.status.value},
    )
    db.commit()
    db.refresh(asset)
    return asset


# ---- 貸出 / 返却 ----------------------------------------------------------


@router.post("/{asset_id}/checkout", response_model=LoanOut, status_code=status.HTTP_201_CREATED)
def checkout(
    asset_id: str,
    body: CheckoutRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> Loan:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "資産が見つかりません"})

    # 借りる人の決定。代理貸出は manager 以上のみ（設計書 FR-3.2 / RBAC）。
    if body.borrower_id == "self":
        borrower = actor
    else:
        if actor.role == Role.member and body.borrower_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "代理貸出には管理者権限が必要です"},
            )
        borrower = db.get(User, body.borrower_id)
        if not borrower or not borrower.is_active:
            raise HTTPException(
                status_code=404, detail={"code": "USER_NOT_FOUND", "message": "借用者が見つかりません"}
            )

    if asset.status != AssetStatus.available:
        if asset.status == AssetStatus.checked_out:
            loan = _current_open_loan(db, asset.id)
            who = loan.borrower.name if loan else "他のユーザー"
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ASSET_ALREADY_CHECKED_OUT", "message": f"この資産は{who}さんが貸出中です"},
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ASSET_NOT_AVAILABLE", "message": f"この資産は貸出できません（状態: {asset.status.value}）"},
        )

    due_at = body.due_at or (utcnow() + timedelta(days=settings.default_loan_days))
    loan = Loan(
        asset_id=asset.id,
        borrower_id=borrower.id,
        checked_out_by=actor.id,
        due_at=due_at,
        note=body.note,
        status=LoanStatus.open,
    )
    asset.status = AssetStatus.checked_out
    db.add(loan)
    try:
        db.flush()
    except IntegrityError:
        # 部分一意インデックス違反 = 競合での二重貸出（設計書 §9.4）。
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ASSET_ALREADY_CHECKED_OUT", "message": "この資産は直前に他の操作で貸出されました"},
        )
    audit_log.record(
        db, actor_id=actor.id, entity_type="loan", entity_id=loan.id, action="checkout",
        after={"asset_tag": asset.asset_tag, "borrower": borrower.name},
    )
    db.commit()
    db.refresh(loan)
    return loan


@router.post("/{asset_id}/checkin", response_model=LoanOut)
def checkin(
    asset_id: str,
    body: CheckinRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> Loan:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail={"code": "ASSET_NOT_FOUND", "message": "資産が見つかりません"})
    loan = _current_open_loan(db, asset.id)
    if not loan:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ASSET_NOT_CHECKED_OUT", "message": "この資産は貸出中ではありません"},
        )

    loan.checkin_at = utcnow()
    loan.checked_in_by = actor.id
    loan.status = LoanStatus.returned
    if body.note:
        loan.note = (loan.note + "\n" if loan.note else "") + body.note

    if body.to_maintenance:
        asset.status = AssetStatus.under_maintenance
        db.add(
            MaintenanceRecord(
                asset_id=asset.id,
                type=MaintenanceType.inspection,
                reported_at=utcnow().date(),
                status=MaintenanceStatus.open,
                description="返却時に点検受付",
            )
        )
    else:
        asset.status = AssetStatus.available

    audit_log.record(
        db, actor_id=actor.id, entity_type="loan", entity_id=loan.id, action="checkin",
        after={"asset_tag": asset.asset_tag, "to_maintenance": body.to_maintenance},
    )
    db.commit()
    db.refresh(loan)
    return loan
