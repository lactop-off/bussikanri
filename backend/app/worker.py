"""督促ワーカー。返却期限を監視し通知を生成する。設計書 FR-6 / §8.2 worker。"""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from .config import get_settings
from .db import SessionLocal
from .models import (
    Loan,
    LoanStatus,
    Notification,
    NotificationChannel,
    NotificationType,
    utcnow,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("karidasu.worker")
settings = get_settings()


def _notify(db, user_id: str, ntype: NotificationType, message: str) -> None:
    db.add(
        Notification(
            user_id=user_id,
            type=ntype,
            payload=message,
            channel=NotificationChannel.in_app,
        )
    )


def run_reminders() -> dict[str, int]:
    """期限前日/当日/超過の貸出に対してアプリ内通知を生成する。

    既に同種の通知をその日に出していれば二重送信しない。
    """
    now = utcnow()
    today = now.date()
    due_soon = 0
    overdue = 0

    with SessionLocal() as db:
        open_loans = db.scalars(select(Loan).where(Loan.status == LoanStatus.open)).all()
        for loan in open_loans:
            days_left = (loan.due_at.date() - today).days
            if loan.due_at < now:
                ntype, msg = NotificationType.overdue, f"資産「{loan.asset.name}」の返却期限を超過しています"
            elif days_left <= 1:
                ntype, msg = NotificationType.due_soon, f"資産「{loan.asset.name}」の返却期限が近づいています"
            else:
                continue

            # 同日・同貸出・同種別の通知が既にあればスキップ（冪等）。
            already = db.scalar(
                select(Notification).where(
                    Notification.user_id == loan.borrower_id,
                    Notification.type == ntype,
                    Notification.sent_at >= now - timedelta(hours=20),
                    Notification.payload == msg,
                )
            )
            if already:
                continue
            _notify(db, loan.borrower_id, ntype, msg)
            if ntype == NotificationType.overdue:
                overdue += 1
            else:
                due_soon += 1
        db.commit()

    logger.info("督促実行: due_soon=%d overdue=%d", due_soon, overdue)
    # TODO: SMTP 設定時はメール送信（aiosmtplib）。MVP ではアプリ内通知のみ。
    return {"due_soon": due_soon, "overdue": overdue}


def _cron_kwargs(expr: str) -> dict:
    minute, hour, dom, month, dow = expr.split()
    return {"minute": minute, "hour": hour, "day": dom, "month": month, "day_of_week": dow}


def main() -> None:
    from .bootstrap import init_db

    init_db()
    scheduler = BlockingScheduler(timezone="UTC")
    try:
        trigger = CronTrigger(**_cron_kwargs(settings.reminder_cron), timezone="UTC")
    except (ValueError, KeyError):
        logger.warning("reminder_cron が不正です。既定 (毎日09:00) を使用します")
        trigger = CronTrigger(hour=9, minute=0, timezone="UTC")
    scheduler.add_job(run_reminders, trigger, id="reminders", replace_existing=True)
    logger.info("督促ワーカーを開始しました (cron=%s)", settings.reminder_cron)
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    main()
