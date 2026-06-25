"""Pydantic v2 スキーマ。"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import (
    AssetStatus,
    AuditResult,
    AuditScope,
    AuditStatus,
    LoanStatus,
    MaintenanceStatus,
    MaintenanceType,
    NotificationType,
    Role,
    TagType,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth -----------------------------------------------------------------


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ---- users ----------------------------------------------------------------


class UserBase(BaseModel):
    email: EmailStr
    name: str
    employee_code: str | None = None
    department: str | None = None
    role: Role = Role.member


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    name: str | None = None
    employee_code: str | None = None
    department: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


class UserOut(ORMModel):
    id: str
    email: EmailStr
    name: str
    employee_code: str | None
    department: str | None
    role: Role
    is_active: bool
    created_at: datetime


class UserBrief(ORMModel):
    id: str
    name: str


# ---- masters --------------------------------------------------------------


class MasterBase(BaseModel):
    name: str
    parent_id: str | None = None


class MasterCreate(MasterBase):
    pass


class MasterOut(ORMModel):
    id: str
    name: str
    parent_id: str | None


# ---- assets ---------------------------------------------------------------


class AssetBase(BaseModel):
    name: str
    category_id: str | None = None
    home_location_id: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_no: str | None = None
    purchase_date: date | None = None
    purchase_price: int | None = None
    warranty_until: date | None = None
    image_url: str | None = None
    notes: str | None = None


class AssetCreate(AssetBase):
    asset_tag: str | None = None  # 未指定なら自動採番
    tag_type: TagType = TagType.qr


class AssetUpdate(BaseModel):
    name: str | None = None
    category_id: str | None = None
    home_location_id: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_no: str | None = None
    status: AssetStatus | None = None
    purchase_date: date | None = None
    purchase_price: int | None = None
    warranty_until: date | None = None
    image_url: str | None = None
    notes: str | None = None


class AssetOut(ORMModel):
    id: str
    asset_tag: str
    tag_type: TagType
    name: str
    category_id: str | None
    home_location_id: str | None
    manufacturer: str | None
    model: str | None
    serial_no: str | None
    status: AssetStatus
    purchase_date: date | None
    purchase_price: int | None
    warranty_until: date | None
    image_url: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class LoanBrief(ORMModel):
    id: str
    borrower: UserBrief
    checkout_at: datetime
    due_at: datetime
    status: LoanStatus


class AssetLookup(ORMModel):
    id: str
    asset_tag: str
    name: str
    status: AssetStatus
    current_loan: LoanBrief | None = None


# ---- loans ----------------------------------------------------------------


class CheckoutRequest(BaseModel):
    borrower_id: str = "self"  # 代理時はユーザーID
    due_at: datetime | None = None  # 省略時は既定日数で自動
    note: str | None = None


class CheckinRequest(BaseModel):
    note: str | None = None
    to_maintenance: bool = False  # 返却と同時にメンテ受付へ


class LoanOut(ORMModel):
    id: str
    asset_id: str
    borrower_id: str
    checked_out_by: str
    checkout_at: datetime
    due_at: datetime
    checkin_at: datetime | None
    checked_in_by: str | None
    status: LoanStatus
    note: str | None
    asset: AssetOut
    borrower: UserBrief


# ---- maintenance ----------------------------------------------------------


class MaintenanceCreate(BaseModel):
    asset_id: str
    type: MaintenanceType
    reported_at: date | None = None
    started_at: date | None = None
    completed_at: date | None = None
    cost: int | None = None
    vendor: str | None = None
    description: str | None = None


class MaintenanceUpdate(BaseModel):
    type: MaintenanceType | None = None
    started_at: date | None = None
    completed_at: date | None = None
    cost: int | None = None
    vendor: str | None = None
    description: str | None = None
    status: MaintenanceStatus | None = None


class MaintenanceOut(ORMModel):
    id: str
    asset_id: str
    type: MaintenanceType
    reported_at: date | None
    started_at: date | None
    completed_at: date | None
    cost: int | None
    vendor: str | None
    performed_by: str | None
    description: str | None
    status: MaintenanceStatus


# ---- audits ---------------------------------------------------------------


class AuditCreate(BaseModel):
    name: str
    scope: AuditScope = AuditScope.all
    scope_ref_id: str | None = None


class AuditScanRequest(BaseModel):
    tags: list[str] = Field(default_factory=list)  # スキャンした asset_tag のリスト（複数可）


class AuditItemOut(ORMModel):
    id: str
    asset_id: str
    scanned_at: datetime | None
    result: AuditResult
    asset: AssetOut


class AuditOut(ORMModel):
    id: str
    name: str
    scope: AuditScope
    scope_ref_id: str | None
    started_at: datetime
    closed_at: datetime | None
    status: AuditStatus


class AuditReport(BaseModel):
    audit: AuditOut
    found: int
    missing: int
    unexpected: int
    items: list[AuditItemOut]


# ---- labels ---------------------------------------------------------------


class LabelRequest(BaseModel):
    asset_ids: list[str] = Field(min_length=1)
    layout: str = "a-one-65"  # ラベルシートレイアウト
    show_name: bool = True


# ---- notifications --------------------------------------------------------


class NotificationOut(ORMModel):
    id: str
    type: NotificationType
    payload: str | None
    sent_at: datetime
    read_at: datetime | None


# ---- dashboard ------------------------------------------------------------


class SettingsOut(ORMModel):
    org_name: str
    default_loan_days: int
    reminder_cron: str
    asset_tag_prefix: str
    reminder_due_template: str
    reminder_overdue_template: str


class SettingsUpdate(BaseModel):
    org_name: str | None = None
    default_loan_days: int | None = Field(default=None, ge=1, le=3650)
    reminder_cron: str | None = None
    asset_tag_prefix: str | None = None
    reminder_due_template: str | None = None
    reminder_overdue_template: str | None = None


class DashboardOut(BaseModel):
    total_assets: int
    checked_out: int
    overdue: int
    under_maintenance: int
    available: int
    my_open_loans: int


# ---- common ---------------------------------------------------------------


class Page(BaseModel):
    total: int
    page: int
    size: int


class AssetPage(Page):
    items: list[AssetOut]


class LoanPage(Page):
    items: list[LoanOut]


class UserPage(Page):
    items: list[UserOut]
