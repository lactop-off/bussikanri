import { useEffect, useState } from "react";
import { api } from "../api";
import { downloadFile } from "../download";
import { useAuth } from "../auth";
import { useMasters } from "../useMasters";
import type { AppSettings, Master, Page, Role, User } from "../types";

type Tab = "masters" | "reports" | "users" | "settings";

export default function Manage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("masters");

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "masters", label: "マスタ", show: true },
    { key: "reports", label: "レポート", show: true },
    { key: "users", label: "ユーザー", show: isAdmin },
    { key: "settings", label: "設定", show: isAdmin },
  ];

  return (
    <div className="manage">
      <h2>管理</h2>
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
  const { categories, locations, reload } = useMasters();
  return (
    <div className="panel">
      <MasterList title="カテゴリ" path="/categories" items={categories} onChange={reload} />
      <MasterList title="保管場所" path="/locations" items={locations} onChange={reload} />
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
      <h3>{title}（{items.length}）</h3>
      <ul className="master-items">
        {items.map((i) => (
          <li key={i.id}>
            {i.name}
            {i.parent_id && <span className="muted small"> ← {nameById[i.parent_id] ?? "?"}</span>}
          </li>
        ))}
      </ul>
      <form className="master-add" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${title}名`} required />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">（親なし）</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <button type="submit">追加</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---- レポート（CSV出力）----
function ReportsPanel() {
  return (
    <div className="panel">
      <div className="card">
        <h3>CSVエクスポート</h3>
        <p className="muted small">UTF-8 BOM 付き（Excel互換）で出力します。</p>
        <div className="report-buttons">
          <button className="ghost" onClick={() => downloadFile("/reports/assets.csv", "assets.csv")}>
            ⬇ 在庫一覧
          </button>
          <button className="ghost" onClick={() => downloadFile("/reports/loans.csv", "loans.csv")}>
            ⬇ 貸出状況
          </button>
          <button className="ghost" onClick={() => downloadFile("/reports/activity.csv", "activity.csv")}>
            ⬇ 操作履歴
          </button>
        </div>
        <p className="muted small">※ 棚卸結果のCSVは「棚卸」画面の各セッションから出力できます。</p>
      </div>
    </div>
  );
}

// ---- ユーザー管理（admin）----
const ROLE_LABEL: Record<Role, string> = { admin: "管理者", manager: "資産管理", member: "一般" };

function UsersPanel() {
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
        <h3>ユーザー（{data?.total ?? 0}）</h3>
        <button className="primary small" onClick={() => setCreating(true)}>
          ＋ 追加
        </button>
      </div>
      <ul className="asset-list">
        {data?.items.map((u) => (
          <li key={u.id} className="card">
            <div className="asset-head">
              <strong>
                {u.name}
                {!u.is_active && <span className="muted small">（無効）</span>}
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
                {u.is_active ? "無効化" : "有効化"}
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
        <h3>ユーザーを追加</h3>
        <form onSubmit={submit}>
          <label>
            氏名 *<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </label>
          <label>
            メール *
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          </label>
          <label>
            初期パスワード *（8文字以上）
            <input
              type="password"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              minLength={8}
              required
            />
          </label>
          <label>
            ロール
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              <option value="member">一般</option>
              <option value="manager">資産管理</option>
              <option value="admin">管理者</option>
            </select>
          </label>
          <label>
            部署
            <input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              追加
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- アプリ設定（admin）----
function SettingsPanel() {
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
      setToast("保存しました（督促スケジュール変更はworker再起動で反映）");
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <p className="muted">読み込み中…</p>;

  return (
    <div className="panel">
      <form className="card settings-form" onSubmit={save}>
        {toast && <div className="toast ok">{toast}</div>}
        <label>
          組織名
          <input value={s.org_name} onChange={(e) => setS({ ...s, org_name: e.target.value })} />
        </label>
        <label>
          既定貸出日数
          <input
            type="number"
            min={1}
            value={s.default_loan_days}
            onChange={(e) => setS({ ...s, default_loan_days: Number(e.target.value) })}
          />
        </label>
        <label>
          管理番号プレフィックス
          <input value={s.asset_tag_prefix} onChange={(e) => setS({ ...s, asset_tag_prefix: e.target.value })} />
        </label>
        <label>
          督促スケジュール (cron: 分 時 日 月 曜)
          <input value={s.reminder_cron} onChange={(e) => setS({ ...s, reminder_cron: e.target.value })} />
        </label>
        <label>
          督促文面（期限間近） — {"{asset}"} {"{due}"} が使えます
          <input
            value={s.reminder_due_template}
            onChange={(e) => setS({ ...s, reminder_due_template: e.target.value })}
          />
        </label>
        <label>
          督促文面（超過）
          <input
            value={s.reminder_overdue_template}
            onChange={(e) => setS({ ...s, reminder_overdue_template: e.target.value })}
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          保存
        </button>
      </form>
    </div>
  );
}
