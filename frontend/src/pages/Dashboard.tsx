import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Dashboard as Dash, Loan, Page } from "../types";
import { fmtDate } from "../statusLabels";

export default function Dashboard() {
  const { user } = useAuth();
  const [dash, setDash] = useState<Dash | null>(null);
  const [myLoans, setMyLoans] = useState<Loan[]>([]);

  useEffect(() => {
    api<Dash>("/dashboard").then(setDash);
    api<Page<Loan>>("/loans?scope=self&open_only=true").then((p) => setMyLoans(p.items));
  }, []);

  const cards: { label: string; value: number | undefined; cls: string }[] = [
    { label: "総資産数", value: dash?.total_assets, cls: "" },
    { label: "貸出中", value: dash?.checked_out, cls: "busy" },
    { label: "期限超過", value: dash?.overdue, cls: "danger" },
    { label: "メンテ中", value: dash?.under_maintenance, cls: "warn" },
  ];

  return (
    <div className="dashboard">
      <h2>こんにちは、{user?.name} さん</h2>
      <div className="kpi-grid">
        {cards.map((c) => (
          <div key={c.label} className={`kpi ${c.cls}`}>
            <span className="kpi-value">{c.value ?? "—"}</span>
            <span className="kpi-label">{c.label}</span>
          </div>
        ))}
      </div>

      <h3>あなたの借用中の資産（{myLoans.length}）</h3>
      {myLoans.length === 0 && <p className="muted">借用中の資産はありません。</p>}
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
                返却期限 {fmtDate(ln.due_at)}
                {overdue && "（超過）"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
