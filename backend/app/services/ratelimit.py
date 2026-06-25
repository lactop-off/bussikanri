"""シンプルなインメモリ・レート制限（設計書 §11 / NFR セキュリティ）。

ログイン試行のブルートフォース抑止に用いる。単一プロセス前提の軽量実装。
分散構成では各プロセスごとの計数になる点に留意（MVP / セルフホスト想定）。
"""

from __future__ import annotations

import threading
import time

_WINDOW_SEC = 300.0  # 5分
_MAX_ATTEMPTS = 10  # ウィンドウ内の最大試行回数

_lock = threading.Lock()
_buckets: dict[str, list[float]] = {}


def check(key: str, *, max_attempts: int = _MAX_ATTEMPTS, window: float = _WINDOW_SEC, now: float | None = None) -> bool:
    """key の試行を1回記録し、上限以内なら True、超過なら False を返す。"""
    t = now if now is not None else time.monotonic()
    with _lock:
        hits = [h for h in _buckets.get(key, []) if t - h < window]
        hits.append(t)
        _buckets[key] = hits
        # 古いキーの掃除（メモリ肥大防止）。
        if len(_buckets) > 10000:
            for k in list(_buckets):
                if all(t - h >= window for h in _buckets[k]):
                    del _buckets[k]
        return len(hits) <= max_attempts


def reset(key: str | None = None) -> None:
    with _lock:
        if key is None:
            _buckets.clear()
        else:
            _buckets.pop(key, None)
