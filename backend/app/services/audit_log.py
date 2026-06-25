"""監査ログ（操作履歴）ヘルパー。追記専用 / 設計書 FR-9。"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models import ActivityLog


def _jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def record(
    db: Session,
    *,
    actor_id: str | None,
    entity_type: str,
    entity_id: str | None,
    action: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> ActivityLog:
    """操作履歴を1件追記する。コミットは呼び出し側に委ねる。"""

    def norm(d: dict[str, Any] | None) -> dict[str, Any] | None:
        if d is None:
            return None
        # JSON 化できる形に正規化（datetime/date → ISO 文字列）。
        return json.loads(json.dumps(d, default=_jsonable, ensure_ascii=False))

    log = ActivityLog(
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        before=norm(before),
        after=norm(after),
    )
    db.add(log)
    return log
