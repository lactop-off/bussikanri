import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth, canManage } from "../auth";
import { offlineQueue } from "../offline";
import NotificationBell from "./NotificationBell";

const NAV = [
  { to: "/", label: "スキャン", icon: "📷", roles: ["member", "manager", "admin"] },
  { to: "/dashboard", label: "ホーム", icon: "🏠", roles: ["member", "manager", "admin"] },
  { to: "/assets", label: "資産", icon: "📦", roles: ["member", "manager", "admin"] },
  { to: "/loans", label: "貸出", icon: "📋", roles: ["member", "manager", "admin"] },
  { to: "/audit", label: "棚卸", icon: "✅", roles: ["manager", "admin"] },
  { to: "/manage", label: "管理", icon: "⚙️", roles: ["manager", "admin"] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [queued, setQueued] = useState(offlineQueue.count());
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onQueue = (e: Event) => setQueued((e as CustomEvent).detail as number);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("krd-queue-change", onQueue);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("krd-queue-change", onQueue);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const nav = NAV.filter((n) => n.roles.includes(user?.role ?? "member"));

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Karidasu</span>
        <div className="topbar-right">
          {!online && <span className="badge offline">オフライン</span>}
          {queued > 0 && <span className="badge pending">保留中 {queued}</span>}
          <NotificationBell />
          <span className="user">{user?.name}</span>
          <button className="link-btn" onClick={logout}>
            ログアウト
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
      <nav className="bottomnav">
        {nav.map((n) => {
          const active = n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to);
          return (
          <Link key={n.to} to={n.to} className={active ? "active" : ""}>
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
          </Link>
          );
        })}
      </nav>
    </div>
  );
}

export { canManage };
