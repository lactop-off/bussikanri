export type Role = "admin" | "manager" | "member";

export type AssetStatus =
  | "available"
  | "checked_out"
  | "under_maintenance"
  | "retired"
  | "lost";

export interface User {
  id: string;
  email: string;
  name: string;
  employee_code: string | null;
  department: string | null;
  role: Role;
  is_active: boolean;
}

export interface Asset {
  id: string;
  asset_tag: string;
  tag_type: string;
  name: string;
  category_id: string | null;
  home_location_id: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_no: string | null;
  status: AssetStatus;
  purchase_date: string | null;
  purchase_price: number | null;
  warranty_until: string | null;
  image_url: string | null;
  notes: string | null;
}

export interface LoanBrief {
  id: string;
  borrower: { id: string; name: string };
  checkout_at: string;
  due_at: string;
  status: string;
}

export interface AssetLookup {
  id: string;
  asset_tag: string;
  name: string;
  status: AssetStatus;
  current_loan: LoanBrief | null;
}

export interface Loan {
  id: string;
  asset_id: string;
  borrower_id: string;
  checkout_at: string;
  due_at: string;
  checkin_at: string | null;
  status: string;
  asset: Asset;
  borrower: { id: string; name: string };
}

export interface MaintenanceRecord {
  id: string;
  asset_id: string;
  type: "inspection" | "repair" | "calibration";
  reported_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cost: number | null;
  vendor: string | null;
  description: string | null;
  status: "open" | "in_progress" | "done";
}

export interface Master {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface AppSettings {
  org_name: string;
  default_loan_days: number;
  reminder_cron: string;
  asset_tag_prefix: string;
  reminder_due_template: string;
  reminder_overdue_template: string;
}

export interface Notification {
  id: string;
  type: "due_soon" | "overdue" | "system";
  payload: string | null;
  sent_at: string;
  read_at: string | null;
}

export interface Dashboard {
  total_assets: number;
  checked_out: number;
  overdue: number;
  under_maintenance: number;
  available: number;
  my_open_loans: number;
}

export interface Page<T> {
  total: number;
  page: number;
  size: number;
  items: T[];
}

export interface AuditReport {
  audit: {
    id: string;
    name: string;
    scope: string;
    status: string;
    started_at: string;
    closed_at: string | null;
  };
  found: number;
  missing: number;
  unexpected: number;
  items: { id: string; asset_id: string; result: string; asset: Asset }[];
}
