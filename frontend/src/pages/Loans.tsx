import { useEffect, useState } from "react";
import { api } from "../api";
import { canManage, useAuth } from "../auth";
import type { Loan, Page } from "../types";
import { fmtDate } from "../statusLabels";

export default function Loans() {
  const { user } = useAuth();
  const manager = canManage(user);
  const [scope, setScope] = useState<"self" | "all">("self");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [data, setData] = useState<Page<Loan> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ scope, size: "50" });
    if (overdueOnly) params.set("overdue_only", "true");
    else params.set("open_only", "true");
    api<Page<Loan>>(`/loans?${params}`).then(setData);
  }, [scope, overdueOnly]);

  return (
    <div className="loans">
      <h2>貸出状況</h2>
      <div className="filters">
        {manager && (
          <div className="seg">
            <button className={scope === "self" ? "active" : ""} onClick={() => setScope("self")}>
              自分
            </button>
            <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
              全体
            </button>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          期限超過のみ
        </label>
      </div>

      {data && <p className="muted small">{data.total} 件</p>}
      <ul className="loan-list">
        {data?.items.map((ln) => {
          const overdue = new Date(ln.due_at) < new Date();
          return (
            <li key={ln.id} className="card">
              <div className="asset-head">
                <strong>{ln.asset.name}</strong>
                <span className={overdue ? "status danger" : "status busy"}>
                  {overdue ? "超過" : "貸出中"}
                </span>
              </div>
              <p className="mono small">{ln.asset.asset_tag}</p>
              <p className="muted small">
                借用: {ln.borrower.name} ・ 期限 {fmtDate(ln.due_at)}
              </p>
            </li>
          );
        })}
        {data?.items.length === 0 && <p className="muted">該当する貸出はありません。</p>}
      </ul>
    </div>
  );
}
