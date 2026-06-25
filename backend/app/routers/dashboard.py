"""ダッシュボード KPI と通知。設計書 FR-8.3 / FR-6 / §9.2。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Asset, AssetStatus, Loan, LoanStatus, Notification, NotificationChannel, User, utcnow
from ..schemas import DashboardOut, NotificationOut

router = APIRouter(tags=["dashboard"])


def _count(db: Session, stmt) -> int:
    return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> DashboardOut:
    def by_status(s: AssetStatus) -> int:
        return _count(db, select(Asset.id).where(Asset.status == s))

    overdue = _count(
        db, select(Loan.id).where(Loan.status == LoanStatus.open, Loan.due_at < utcnow())
    )
    my_open = _count(
        db, select(Loan.id).where(Loan.borrower_id == user.id, Loan.status == LoanStatus.open)
    )
    return DashboardOut(
        total_assets=_count(db, select(Asset.id).where(Asset.status != AssetStatus.retired)),
        checked_out=by_status(AssetStatus.checked_out),
        overdue=overdue,
        under_maintenance=by_status(AssetStatus.under_maintenance),
        available=by_status(AssetStatus.available),
        my_open_loans=my_open,
    )


@router.get("/notifications", response_model=list[NotificationOut])
def notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # アプリ内通知のみ表示（メールは配信記録なので除外）。
    stmt = select(Notification).where(
        Notification.user_id == user.id,
        Notification.channel == NotificationChannel.in_app,
    )
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = db.scalars(stmt.order_by(Notification.sent_at.desc()).limit(100)).all()
    return list(rows)


@router.post("/notifications/{notif_id}/read", response_model=NotificationOut)
def mark_read(notif_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    notif = db.get(Notification, notif_id)
    if not notif or notif.user_id != user.id:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "通知が見つかりません"})
    if not notif.read_at:
        notif.read_at = utcnow()
        db.commit()
        db.refresh(notif)
    return notif


@router.post("/notifications/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
    return {"status": "ok"}
