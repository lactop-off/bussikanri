import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth, canManage } from "../auth";
import { useT } from "../i18n";
import { offlineQueue } from "../offline";
import NotificationBell from "./NotificationBell";

const NAV = [
  { to: "/", key: "nav.scan", icon: "📷", roles: ["member", "manager", "admin"] },
  { to: "/dashboard", key: "nav.home", icon: "🏠", roles: ["member", "manager", "admin"] },
  { to: "/assets", key: "nav.assets", icon: "📦", roles: ["member", "manager", "admin"] },
  { to: "/loans", key: "nav.loans", icon: "📋", roles: ["member", "manager", "admin"] },
  { to: "/audit", key: "nav.audit", icon: "✅", roles: ["manager", "admin"] },
  { to: "/manage", key: "nav.manage", icon: "⚙️", roles: ["manager", "admin"] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useT();
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
          {!online && <span className="badge offline">{t("top.offline")}</span>}
          {queued > 0 && <span className="badge pending">{t("top.pending", { n: queued })}</span>}
          <NotificationBell />
          <button
            className="link-btn lang"
            onClick={() => setLocale(locale === "ja" ? "en" : "ja")}
            aria-label="Language"
          >
            {locale === "ja" ? "EN" : "日本語"}
          </button>
          <span className="user">{user?.name}</span>
          <button className="link-btn" onClick={logout}>
            {t("top.logout")}
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
            <span className="nav-label">{t(n.key)}</span>
          </Link>
          );
        })}
      </nav>
    </div>
  );
}

export { canManage };
