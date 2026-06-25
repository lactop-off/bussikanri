import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import type { Dashboard as Dash, Loan, Page } from "../types";
import { fmtDate } from "../statusLabels";

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useT();
  const [dash, setDash] = useState<Dash | null>(null);
  const [myLoans, setMyLoans] = useState<Loan[]>([]);

  useEffect(() => {
    api<Dash>("/dashboard").then(setDash);
    api<Page<Loan>>("/loans?scope=self&open_only=true").then((p) => setMyLoans(p.items));
  }, []);

  const cards: { label: string; value: number | undefined; cls: string }[] = [
    { label: t("dash.totalAssets"), value: dash?.total_assets, cls: "" },
    { label: t("dash.checkedOut"), value: dash?.checked_out, cls: "busy" },
    { label: t("dash.overdue"), value: dash?.overdue, cls: "danger" },
    { label: t("dash.underMaintenance"), value: dash?.under_maintenance, cls: "warn" },
  ];

  return (
    <div className="dashboard">
      <h2>{t("dash.greeting", { name: user?.name ?? "" })}</h2>
      <div className="kpi-grid">
        {cards.map((c) => (
          <div key={c.label} className={`kpi ${c.cls}`}>
            <span className="kpi-value">{c.value ?? "—"}</span>
            <span className="kpi-label">{c.label}</span>
          </div>
        ))}
      </div>

      <h3>{t("dash.yourLoans", { n: myLoans.length })}</h3>
      {myLoans.length === 0 && <p className="muted">{t("dash.noLoans")}</p>}
      <ul className="loan-list">
        {myLoans.map((ln) => {
          const overdue = new Date(ln.due_at) < new Date();
          return (
            <li key={ln.id} className="card row">
              <div>
                <strong>{ln.asset.name}</strong>
                <span className="mono small"> {ln.asset.asset_tag}</span>
              </div>
              <span className={overdue ? "status danger" : "muted"}>
                {t("dash.due", { due: fmtDate(ln.due_at) })}
                {overdue && t("dash.overdueMark")}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
