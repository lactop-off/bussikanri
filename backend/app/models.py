"""ドメインモデル (SQLAlchemy 2.0)。設計書 §7 ER図に対応。"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- enums ----------------------------------------------------------------


class Role(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    member = "member"


class TagType(str, enum.Enum):
    qr = "qr"
    code128 = "code128"
    ean = "ean"


class AssetStatus(str, enum.Enum):
    available = "available"
    checked_out = "checked_out"
    under_maintenance = "under_maintenance"
    retired = "retired"
    lost = "lost"


class LoanStatus(str, enum.Enum):
    open = "open"
    returned = "returned"
    overdue = "overdue"


class MaintenanceType(str, enum.Enum):
    inspection = "inspection"
    repair = "repair"
    calibration = "calibration"


class MaintenanceStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    done = "done"


class AuditScope(str, enum.Enum):
    all = "all"
    category = "category"
    location = "location"


class AuditStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class AuditResult(str, enum.Enum):
    found = "found"
    missing = "missing"
    unexpected = "unexpected"


class NotificationType(str, enum.Enum):
    due_soon = "due_soon"
    overdue = "overdue"
    system = "system"


class NotificationChannel(str, enum.Enum):
    in_app = "in_app"
    email = "email"


# ---- entities -------------------------------------------------------------


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    employee_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.member)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"), nullable=True)


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("locations.id"), nullable=True)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    asset_tag: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    tag_type: Mapped[TagType] = mapped_column(Enum(TagType), default=TagType.qr)
    name: Mapped[str] = mapped_column(String(255))
    category_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    home_location_id: Mapped[str | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serial_no: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[AssetStatus] = mapped_column(Enum(AssetStatus), default=AssetStatus.available, index=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warranty_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    category: Mapped[Category | None] = relationship(lazy="joined")
    home_location: Mapped[Location | None] = relationship(lazy="joined")


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    borrower_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    checked_out_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    checkout_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_in_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[LoanStatus] = mapped_column(Enum(LoanStatus), default=LoanStatus.open, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    asset: Mapped[Asset] = relationship(lazy="joined")
    borrower: Mapped[User] = relationship(foreign_keys=[borrower_id], lazy="joined")

    __table_args__ = (
        # 1資産につき同時に status='open' は1件のみ（設計書 §7.2 / §9.4）。
        Index(
            "uq_open_loan_per_asset",
            "asset_id",
            unique=True,
            sqlite_where=text("status = 'open'"),
            postgresql_where=text("status = 'open'"),
        ),
    )


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    type: Mapped[MaintenanceType] = mapped_column(Enum(MaintenanceType))
    reported_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    started_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    cost: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    performed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[MaintenanceStatus] = mapped_column(Enum(MaintenanceStatus), default=MaintenanceStatus.open)


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    scope: Mapped[AuditScope] = mapped_column(Enum(AuditScope), default=AuditScope.all)
    scope_ref_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[AuditStatus] = mapped_column(Enum(AuditStatus), default=AuditStatus.open)


class AuditItem(Base):
    __tablename__ = "audit_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    audit_id: Mapped[str] = mapped_column(ForeignKey("audits.id"), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scanned_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    result: Mapped[AuditResult] = mapped_column(Enum(AuditResult))

    asset: Mapped[Asset] = relationship(lazy="joined")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType))
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    channel: Mapped[NotificationChannel] = mapped_column(Enum(NotificationChannel), default=NotificationChannel.in_app)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ActivityLog(Base):
    """監査ログ（追記専用 / 設計書 FR-9）。"""

    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(64))
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    org_name: Mapped[str] = mapped_column(String(255), default="Karidasu")
    default_loan_days: Mapped[int] = mapped_column(Integer, default=14)
    reminder_cron: Mapped[str] = mapped_column(String(64), default="0 9 * * *")
    smtp_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    asset_tag_prefix: Mapped[str] = mapped_column(String(32), default="KRD-")
    # 督促文面テンプレート（FR-6.3）。{asset} {due} を差し込む。
    reminder_due_template: Mapped[str] = mapped_column(
        Text, default="資産「{asset}」の返却期限（{due}）が近づいています"
    )
    reminder_overdue_template: Mapped[str] = mapped_column(
        Text, default="資産「{asset}」の返却期限（{due}）を超過しています"
    )
