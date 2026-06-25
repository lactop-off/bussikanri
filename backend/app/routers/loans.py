"""貸出一覧。設計書 FR-3.7 / §9.2 /loans。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Loan, LoanStatus, Role, User, utcnow
from ..schemas import LoanOut, LoanPage

router = APIRouter(prefix="/loans", tags=["loans"])


@router.get("", response_model=LoanPage)
def list_loans(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    scope: str = Query("self", pattern="^(self|all)$", description="self=自分のみ / all=全体(manager+)"),
    open_only: bool = Query(False, description="貸出中(open/overdue)のみ"),
    overdue_only: bool = Query(False, description="返却期限超過のみ"),
    asset_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LoanPage:
    stmt = select(Loan)
    # member は自分の貸出しか見られない。manager 以上は scope=all で全体を見られる。
    if scope == "self" or user.role == Role.member:
        stmt = stmt.where(Loan.borrower_id == user.id)
    if asset_id:
        stmt = stmt.where(Loan.asset_id == asset_id)
    if overdue_only:
        stmt = stmt.where(Loan.status == LoanStatus.open, Loan.due_at < utcnow())
    elif open_only:
        stmt = stmt.where(Loan.status == LoanStatus.open)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Loan.checkout_at.desc()).offset((page - 1) * size).limit(size)
    ).all()
    return LoanPage(total=total, page=page, size=size, items=list(rows))
