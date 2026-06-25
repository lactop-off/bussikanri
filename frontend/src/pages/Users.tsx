import { useEffect, useState } from "react";
import { api } from "../api";
import type { Page, Role, User } from "../types";

const ROLE_LABEL: Record<Role, string> = { admin: "管理者", manager: "資産管理", member: "一般" };

export default function Users() {
  const [data, setData] = useState<Page<User> | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setData(await api<Page<User>>("/users?size=200"));
  }

  useEffect(() => {
    load();
  }, []);

  async function setRole(u: User, role: Role) {
    await api(`/users/${u.id}`, { method: "PATCH", body: { role } });
    load();
  }

  async function toggleActive(u: User) {
    await api(`/users/${u.id}`, { method: "PATCH", body: { is_active: !u.is_active } });
    load();
  }

  return (
    <div className="users">
      <div className="page-head">
        <h2>ユーザー管理</h2>
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
                {!u.is_active && <span className="muted small"> （無効）</span>}
              </strong>
              <span className="muted small">{u.department || ""}</span>
            </div>
            <p className="muted small">{u.email}</p>
            <div className="user-controls">
              <select value={u.role} onChange={(e) => setRole(u, e.target.value as Role)}>
                {(["member", "manager", "admin"] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <button className="ghost small" onClick={() => toggleActive(u)}>
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
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "member" as Role,
    employee_code: "",
    department: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/users", {
        method: "POST",
        body: {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          employee_code: form.employee_code || null,
          department: form.department || null,
        },
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
            氏名 *
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            メール *
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            初期パスワード *（8文字以上）
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
            />
          </label>
          <label>
            ロール
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="member">一般</option>
              <option value="manager">資産管理</option>
              <option value="admin">管理者</option>
            </select>
          </label>
          <label>
            社員コード
            <input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
          </label>
          <label>
            部署
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
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
