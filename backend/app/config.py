"""アプリ設定。環境変数 / .env から読み込む。"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # データベース。既定は SQLite（ローカル/テスト用）。本番は docker-compose で Postgres を渡す。
    database_url: str = "sqlite+pysqlite:///./karidasu.db"

    # 認証
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    # 業務既定値
    default_loan_days: int = 14
    asset_tag_prefix: str = "KRD-"

    # 組織
    org_name: str = "Karidasu"

    # メール / 督促
    smtp_url: str | None = None  # smtp://user:pass@host:port
    mail_from: str = "karidasu@example.com"
    reminder_cron: str = "0 9 * * *"  # 毎日09:00

    # 起動時に管理者を自動作成（初回セットアップ）
    admin_email: str | None = None
    admin_password: str | None = None
    admin_name: str = "管理者"

    # CORS。カンマ区切り。
    cors_origins: str = "*"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
