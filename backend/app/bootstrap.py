"""初期化: テーブル作成と管理者の自動作成（設計書 §12 初回セットアップ）。"""

from __future__ import annotations

import logging

from sqlalchemy import select

from .config import get_settings
from .db import Base, SessionLocal, engine
from .models import AppSetting, Role, User
from .security import hash_password

logger = logging.getLogger("karidasu.bootstrap")


def init_db() -> None:
    """テーブルを用意し、初期データを投入する。

    SQLite（ローカル/テスト）では create_all で簡便に作成する。
    PostgreSQL（本番）ではテーブル作成は Alembic マイグレーションに委ね、
    ここでは初期データ投入のみ行う（api コンテナ起動時に `alembic upgrade head` を実行）。
    """
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)
    settings = get_settings()

    with SessionLocal() as db:
        # アプリ設定の1行を保証。
        if not db.get(AppSetting, 1):
            db.add(
                AppSetting(
                    id=1,
                    org_name=settings.org_name,
                    default_loan_days=settings.default_loan_days,
                    reminder_cron=settings.reminder_cron,
                    asset_tag_prefix=settings.asset_tag_prefix,
                )
            )
            db.commit()

        # 管理者の自動作成（環境変数で指定された場合のみ）。
        if settings.admin_email and settings.admin_password:
            exists = db.scalar(select(User).where(User.email == settings.admin_email))
            if not exists:
                db.add(
                    User(
                        email=settings.admin_email,
                        name=settings.admin_name,
                        role=Role.admin,
                        password_hash=hash_password(settings.admin_password),
                    )
                )
                db.commit()
                logger.info("管理者ユーザーを作成しました: %s", settings.admin_email)
