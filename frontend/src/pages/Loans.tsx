import { useEffect, useState } from "react";
import { api } from "../api";
import { canManage, useAuth } from "../auth";
import { useT } from "../i18n";
import type { Loan, Page } from "../types";
import { fmtDate } from "../statusLabels";

export default function Loans() {
  const { user } = useAuth();
  const { t } = useT();
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
      <h2>{t("loans.title")}</h2>
      <div className="filters">
        {manager && (
          <div className="seg">
            <button className={scope === "self" ? "active" : ""} onClick={() => setScope("self")}>
              {t("loans.self")}
            </button>
            <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
              {t("loans.all")}
            </button>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          {t("loans.overdueOnly")}
        </label>
      </div>

      {data && <p className="muted small">{t("common.count", { n: data.total })}</p>}
      <ul className="loan-list">
        {data?.items.map((ln) => {
          const overdue = new Date(ln.due_at) < new Date();
          return (
            <li key={ln.id} className="card">
              <div className="asset-head">
                <strong>{ln.asset.name}</strong>
                <span className={overdue ? "status danger" : "status busy"}>
                  {overdue ? t("loans.overdue") : t("loans.checkedOut")}
                </span>
              </div>
              <p className="mono small">{ln.asset.asset_tag}</p>
              <p className="muted small">
                {t("loans.borrowerDue", { name: ln.borrower.name, due: fmtDate(ln.due_at) })}
              </p>
            </li>
          );
        })}
        {data?.items.length === 0 && <p className="muted">{t("loans.none")}</p>}
      </ul>
    </div>
  );
}
