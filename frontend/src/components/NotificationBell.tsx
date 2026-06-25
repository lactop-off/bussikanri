import { useEffect, useState } from "react";
import { api } from "../api";
import type { Notification } from "../types";
import { fmtDate } from "../statusLabels";

// アプリ内通知ベル（設計書 FR-6 / §10）。定期的に未読を取得して表示する。
export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      setItems(await api<Notification[]>("/notifications"));
    } catch {
      /* オフライン等は無視 */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // 1分ごと
    return () => clearInterval(t);
  }, []);

  const unread = items.filter((n) => !n.read_at).length;

  async function markAll() {
    await api("/notifications/read-all", { method: "POST", body: {} });
    load();
  }

  async function markOne(id: string) {
    await api(`/notifications/${id}/read`, { method: "POST", body: {} });
    load();
  }

  return (
    <div className="bell">
      <button className="bell-btn" onClick={() => setOpen((o) => !o)} aria-label="通知">
        🔔{unread > 0 && <span className="bell-badge">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="bell-overlay" onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="bell-head">
              <strong>通知</strong>
              {unread > 0 && (
                <button className="link-btn dark" onClick={markAll}>
                  すべて既読
                </button>
              )}
            </div>
            {items.length === 0 && <p className="muted small bell-empty">通知はありません</p>}
            <ul>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={n.read_at ? "read" : "unread"}
                  onClick={() => !n.read_at && markOne(n.id)}
                >
                  <p className="small">{n.payload}</p>
                  <span className="muted small">{fmtDate(n.sent_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
