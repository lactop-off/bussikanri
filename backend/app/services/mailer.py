"""SMTP メール送信（設計書 FR-6.2）。

SMTP_URL（例: smtp://user:pass@host:587 / smtps://...）が設定されている場合のみ送信する。
同期ワーカーから呼ぶため標準ライブラリ smtplib を用いる。
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import unquote, urlparse

from ..config import get_settings

logger = logging.getLogger("karidasu.mailer")


def is_configured() -> bool:
    return bool(get_settings().smtp_url)


def send_mail(to: str, subject: str, body: str) -> bool:
    """1通送信する。成功で True。未設定/失敗で False（呼び出し側は致命扱いしない）。"""
    settings = get_settings()
    if not settings.smtp_url:
        return False
    try:
        u = urlparse(settings.smtp_url)
        host = u.hostname or "localhost"
        use_ssl = u.scheme == "smtps"
        port = u.port or (465 if use_ssl else 587)
        username = unquote(u.username) if u.username else None
        password = unquote(u.password) if u.password else None

        msg = EmailMessage()
        msg["From"] = settings.mail_from
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)

        smtp_cls = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with smtp_cls(host, port, timeout=15) as server:
            if not use_ssl:
                try:
                    server.starttls()
                except smtplib.SMTPException:
                    pass  # STARTTLS 非対応サーバはそのまま続行
            if username and password:
                server.login(username, password)
            server.send_message(msg)
        return True
    except Exception as e:  # noqa: BLE001 — 通知失敗で督促全体を止めない
        logger.warning("メール送信に失敗しました to=%s: %s", to, e)
        return False
