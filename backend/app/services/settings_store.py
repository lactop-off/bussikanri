"""アプリ設定（AppSettings の単一行）へのアクセスヘルパー。

DB に設定行があればそれを優先し、無ければ環境変数(config)の既定値で1行を作成する。
これにより管理画面からの変更（FR-6.3 等）が実挙動に反映される。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AppSetting


def get_row(db: Session) -> AppSetting:
    row = db.get(AppSetting, 1)
    if row is None:
        env = get_settings()
        row = AppSetting(
            id=1,
            org_name=env.org_name,
            default_loan_days=env.default_loan_days,
            reminder_cron=env.reminder_cron,
            asset_tag_prefix=env.asset_tag_prefix,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row
