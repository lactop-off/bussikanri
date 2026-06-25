import { useEffect, useState } from "react";
import { api } from "../api";
import { downloadFile } from "../download";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import { useMasters } from "../useMasters";
import type { AppSettings, Master, Page, Role, User } from "../types";

type Tab = "masters" | "reports" | "users" | "settings";

export default function Manage() {
  const { user } = useAuth();
  const { t } = useT();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("masters");

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "masters", label: t("manage.tabMasters"), show: true },
    { key: "reports", label: t("manage.tabReports"), show: true },
    { key: "users", label: t("manage.tabUsers"), show: isAdmin },
    { key: "settings", label: t("manage.tabSettings"), show: isAdmin },
  ];

  return (
    <div className="manage">
      <h2>{t("manage.title")}</h2>
      <div className="tabs">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
      </div>

      {tab === "masters" && <MastersPanel />}
      {tab === "reports" && <ReportsPanel />}
      {tab === "users" && isAdmin && <UsersPanel />}
      {tab === "settings" && isAdmin && <SettingsPanel />}
    </div>
  );
}

// ---- マスタ管理（カテゴリ / 保管場所、階層対応）----
function MastersPanel() {
  const { t } = useT();
  const { categories, locations, reload } = useMasters();
  return (
    <div className="panel">
      <MasterList title={t("manage.categories")} path="/categories" items={categories} onChange={reload} />
      <MasterList title={t("manage.locations")} path="/locations" items={locations} onChange={reload} />
    </div>
  );
}

function MasterList({
  title,
  path,
  items,
  onChange,
}: {
  title: string;
  path: string;
  items: Master[];
  onChange: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(path, { method: "POST", body: { name, parent_id: parentId || null } });
      setName("");
      setParentId("");
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const nameById = Object.fromEntries(items.map((i) => [i.id, i.name]));

  return (
    <div className="card">
      <h3>{title} ({items.length})</h3>
      <ul className="master-items">
        {items.map((i) => (
          <li key={i.id}>
            {i.name}
            {i.parent_id && <span className="muted small"> ← {nameById[i.parent_id] ?? "?"}</span>}
          </li>
        ))}
      </ul>
      <form className="master-add" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={title} required />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t("manage.noParent")}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <button type="submit">{t("common.add")}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---- レポート（CSV出力）----
function ReportsPanel() {
  const { t } = useT();
  return (
    <div className="panel">
      <div className="card">
        <h3>{t("manage.csvTitle")}</h3>
        <p className="muted small">{t("manage.csvNote")}</p>
        <div className="report-buttons">
          <button className="ghost" onClick={() => downloadFile("/reports/assets.csv", "assets.csv")}>
            ⬇ {t("manage.repAssets")}
          </button>
          <button className="ghost" onClick={() => downloadFile("/reports/loans.csv", "loans.csv")}>
            ⬇ {t("manage.repLoans")}
          </button>
          <button className="ghost" onClick={() => downloadFile("/reports/activity.csv", "activity.csv")}>
            ⬇ {t("manage.repActivity")}
          </button>
        </div>
        <p className="muted small">{t("manage.auditCsvNote")}</p>
      </div>
    </div>
  );
}

// ---- ユーザー管理（admin）----
function UsersPanel() {
  const { t } = useT();
  const ROLE_LABEL: Record<Role, string> = {
    admin: t("role.admin"),
    manager: t("role.manager"),
    member: t("role.member"),
  };
  const [data, setData] = useState<Page<User> | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setData(await api<Page<User>>("/users?size=200"));
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(u: User, body: Record<string, unknown>) {
    await api(`/users/${u.id}`, { method: "PATCH", body });
    load();
  }

  return (
    <div className="panel">
      <div className="page-head">
        <h3>{t("manage.users", { n: data?.total ?? 0 })}</h3>
        <button className="primary small" onClick={() => setCreating(true)}>
          ＋ {t("common.add")}
        </button>
      </div>
      <ul className="asset-list">
        {data?.items.map((u) => (
          <li key={u.id} className="card">
            <div className="asset-head">
              <strong>
                {u.name}
                {!u.is_active && <span className="muted small">{t("manage.disabled")}</span>}
              </strong>
              <span className="muted small">{u.department || ""}</span>
            </div>
            <p className="muted small">{u.email}</p>
            <div className="user-controls">
              <select value={u.role} onChange={(e) => patch(u, { role: e.target.value })}>
                {(["member", "manager", "admin"] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <button className="ghost small" onClick={() => patch(u, { is_active: !u.is_active })}>
                {u.is_active ? t("manage.disable") : t("manage.enable")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ name: "", email: "", password: "", role: "member" as Role, department: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/users", {
        method: "POST",
        body: { ...f, department: f.department || null },
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t("manage.addUser")}</h3>
        <form onSubmit={submit}>
          <label>
            {t("manage.userName")} *<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </label>
          <label>
            {t("login.email")} *
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          </label>
          <label>
            {t("manage.initialPassword")} *
            <input
              type="password"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              minLength={8}
              required
            />
          </label>
          <label>
            {t("manage.role")}
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              <option value="member">{t("role.member")}</option>
              <option value="manager">{t("role.manager")}</option>
              <option value="admin">{t("role.admin")}</option>
            </select>
          </label>
          <label>
            {t("manage.department")}
            <input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              {t("common.add")}
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- アプリ設定（admin）----
function SettingsPanel() {
  const { t } = useT();
  const [s, setS] = useState<AppSettings | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AppSettings>("/settings").then(setS);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setToast(null);
    try {
      const saved = await api<AppSettings>("/settings", { method: "PATCH", body: s });
      setS(saved);
      setToast(t("manage.saved"));
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <p className="muted">{t("common.loading")}</p>;

  return (
    <div className="panel">
      <form className="card settings-form" onSubmit={save}>
        {toast && <div className="toast ok">{toast}</div>}
        <label>
          {t("manage.orgName")}
          <input value={s.org_name} onChange={(e) => setS({ ...s, org_name: e.target.value })} />
        </label>
        <label>
          {t("manage.loanDays")}
          <input
            type="number"
            min={1}
            value={s.default_loan_days}
            onChange={(e) => setS({ ...s, default_loan_days: Number(e.target.value) })}
          />
        </label>
        <label>
          {t("manage.prefix")}
          <input value={s.asset_tag_prefix} onChange={(e) => setS({ ...s, asset_tag_prefix: e.target.value })} />
        </label>
        <label>
          {t("manage.cron")}
          <input value={s.reminder_cron} onChange={(e) => setS({ ...s, reminder_cron: e.target.value })} />
        </label>
        <label>
          {t("manage.tmplDue")}
          <input
            value={s.reminder_due_template}
            onChange={(e) => setS({ ...s, reminder_due_template: e.target.value })}
          />
        </label>
        <label>
          {t("manage.tmplOverdue")}
          <input
            value={s.reminder_overdue_template}
            onChange={(e) => setS({ ...s, reminder_overdue_template: e.target.value })}
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {t("common.save")}
        </button>
      </form>
    </div>
  );
}
