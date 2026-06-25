"""督促ワーカー。返却期限を監視し通知を生成する。設計書 FR-6 / §8.2 worker。"""

from __future__ import annotations

import logging
from datetime import timezone, timedelta

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
from .services import mailer, settings_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("karidasu.worker")
settings = get_settings()


def _fmt(template: str, asset: str, due: str) -> str:
    try:
        return template.format(asset=asset, due=due)
    except (KeyError, IndexError):
        return template


def _notify(db, user_id: str, ntype: NotificationType, message: str, email: str | None) -> bool:
    """アプリ内通知を記録し、SMTP 設定時はメールも送る。メール送信可否を返す。"""
    db.add(Notification(user_id=user_id, type=ntype, payload=message, channel=NotificationChannel.in_app))
    sent = False
    if email and mailer.is_configured():
        subject = "【Karidasu】返却期限のお知らせ" if ntype == NotificationType.due_soon else "【Karidasu】返却期限超過のお知らせ"
        if mailer.send_mail(email, subject, message):
            db.add(Notification(user_id=user_id, type=ntype, payload=message, channel=NotificationChannel.email))
            sent = True
    return sent


def run_reminders() -> dict[str, int]:
    """期限前日/当日/超過の貸出に対してアプリ内通知を生成する。

    既に同種の通知をその日に出していれば二重送信しない。
    """
    now = utcnow()
    today = now.date()
    due_soon = 0
    overdue = 0

    with SessionLocal() as db:
        cfg = settings_store.get_row(db)
        open_loans = db.scalars(select(Loan).where(Loan.status == LoanStatus.open)).all()
        for loan in open_loans:
            # SQLite は naive を返すため UTC とみなして正規化（Postgres は aware）。
            due = loan.due_at if loan.due_at.tzinfo else loan.due_at.replace(tzinfo=timezone.utc)
            days_left = (due.date() - today).days
            due_str = due.strftime("%Y/%m/%d")
            if due < now:
                ntype = NotificationType.overdue
                msg = _fmt(cfg.reminder_overdue_template, loan.asset.name, due_str)
            elif days_left <= 1:
                ntype = NotificationType.due_soon
                msg = _fmt(cfg.reminder_due_template, loan.asset.name, due_str)
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
            _notify(db, loan.borrower_id, ntype, msg, loan.borrower.email)
            if ntype == NotificationType.overdue:
                overdue += 1
            else:
                due_soon += 1
        db.commit()

    logger.info(
        "督促実行: due_soon=%d overdue=%d (mail=%s)", due_soon, overdue, "on" if mailer.is_configured() else "off"
    )
    return {"due_soon": due_soon, "overdue": overdue}


def _cron_kwargs(expr: str) -> dict:
    minute, hour, dom, month, dow = expr.split()
    return {"minute": minute, "hour": hour, "day": dom, "month": month, "day_of_week": dow}


def main() -> None:
    # スキーマ作成・初期データ投入は api コンテナが担う（worker は監視のみ）。
    # 督促スケジュールは DB 設定を優先（管理画面から変更可 / FR-6.3）。反映には再起動が必要。
    cron = settings.reminder_cron
    try:
        with SessionLocal() as db:
            cron = settings_store.get_row(db).reminder_cron
    except Exception as e:  # noqa: BLE001 — DB 未準備時は env 既定にフォールバック
        logger.warning("設定読込に失敗。env の reminder_cron を使用します: %s", e)

    scheduler = BlockingScheduler(timezone="UTC")
    try:
        trigger = CronTrigger(**_cron_kwargs(cron), timezone="UTC")
    except (ValueError, KeyError):
        logger.warning("reminder_cron が不正です。既定 (毎日09:00) を使用します")
        trigger = CronTrigger(hour=9, minute=0, timezone="UTC")
    scheduler.add_job(run_reminders, trigger, id="reminders", replace_existing=True)
    logger.info("督促ワーカーを開始しました (cron=%s)", cron)
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    main()
