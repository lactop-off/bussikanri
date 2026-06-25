import { useEffect, useState } from "react";
import Scanner from "../components/Scanner";
import { api } from "../api";
import { downloadFile } from "../download";
import { offlineQueue } from "../offline";
import { useT } from "../i18n";
import { useMasters } from "../useMasters";
import type { AuditReport } from "../types";

// 棚卸モード（設計書 FR-5 / §10.3）。連続スキャンで台帳照合、オフライン退避対応。
export default function Audit() {
  const { t } = useT();
  const { categories, locations } = useMasters();
  const [audits, setAudits] = useState<{ id: string; name: string; status: string }[]>([]);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"all" | "category" | "location">("all");
  const [scopeRef, setScopeRef] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  async function loadList() {
    setAudits(await api("/audits"));
  }

  useEffect(() => {
    loadList();
  }, []);

  async function create() {
    if (!name.trim()) return;
    if (scope !== "all" && !scopeRef) return;
    const a = await api<{ id: string }>("/audits", {
      method: "POST",
      body: { name: name.trim(), scope, scope_ref_id: scope === "all" ? null : scopeRef },
    });
    setName("");
    setScope("all");
    setScopeRef("");
    await loadList();
    open(a.id);
  }

  async function open(id: string) {
    setReport(await api<AuditReport>(`/audits/${id}`));
    setRecent([]);
  }

  async function onScan(tag: string) {
    if (!report) return;
    setRecent((r) => [tag, ...r].slice(0, 8));
    if (!navigator.onLine) {
      offlineQueue.enqueue({
        kind: "audit_scan",
        path: `/audits/${report.audit.id}/scan`,
        body: { tags: [tag] },
        label: `audit scan: ${tag}`,
      });
      return;
    }
    const updated = await api<AuditReport>(`/audits/${report.audit.id}/scan`, {
      method: "POST",
      body: { tags: [tag] },
    });
    setReport(updated);
  }

  async function close() {
    if (!report) return;
    if (!confirm(t("audit.closeConfirm"))) return;
    const final = await api<AuditReport>(`/audits/${report.audit.id}/close`, { method: "POST", body: {} });
    setReport(final);
    await loadList();
  }

  if (!report) {
    return (
      <div className="audit">
        <h2>{t("audit.title")}</h2>
        <div className="card">
          <h3>{t("audit.new")}</h3>
          <label>
            {t("audit.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {t("audit.scope")}
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as typeof scope);
                setScopeRef("");
              }}
            >
              <option value="all">{t("audit.scopeAll")}</option>
              <option value="category">{t("audit.scopeCategory")}</option>
              <option value="location">{t("audit.scopeLocation")}</option>
            </select>
          </label>
          {scope !== "all" && (
            <label>
              {scope === "category" ? t("audit.scopeCategory") : t("audit.scopeLocation")}
              <select value={scopeRef} onChange={(e) => setScopeRef(e.target.value)}>
                <option value="">{t("audit.selectScope")}</option>
                {(scope === "category" ? categories : locations).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="primary block" onClick={create} disabled={!name.trim() || (scope !== "all" && !scopeRef)}>
            {t("audit.start")}
          </button>
        </div>
        <h3>{t("audit.past")}</h3>
        <ul className="audit-list">
          {audits.map((a) => (
            <li key={a.id} className="card row" onClick={() => open(a.id)}>
              <strong>{a.name}</strong>
              <span className={a.status === "closed" ? "muted" : "status busy"}>
                {a.status === "closed" ? t("audit.closed") : t("audit.running")}
              </span>
            </li>
          ))}
          {audits.length === 0 && <p className="muted">{t("audit.none")}</p>}
        </ul>
      </div>
    );
  }

  const open_ = report.audit.status === "open";
  return (
    <div className="audit">
      <div className="page-head">
        <h2>{report.audit.name}</h2>
        <div className="toolbar">
          <button
            className="ghost small"
            onClick={() =>
              downloadFile(`/reports/audit.csv?audit_id=${report.audit.id}`, `audit-${report.audit.id}.csv`)
            }
          >
            ⬇ CSV
          </button>
          <button className="ghost small" onClick={() => setReport(null)}>
            ← {t("common.toList")}
          </button>
        </div>
      </div>

      <div className="audit-stats">
        <span className="stat ok">{t("audit.found")} {report.found}</span>
        <span className="stat danger">{t("audit.missing")} {report.missing}</span>
        <span className="stat warn">{t("audit.unexpected")} {report.unexpected}</span>
      </div>

      {open_ ? (
        <>
          <Scanner onScan={onScan} continuous cooldownMs={1200} />
          {recent.length > 0 && (
            <div className="recent">
              <p className="muted small">{t("audit.recent")}</p>
              <ul>
                {recent.map((tag, i) => (
                  <li key={i} className="mono small">
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="primary block" onClick={close}>
            {t("audit.close")}
          </button>
        </>
      ) : (
        <div className="card">
          <p className="muted">{t("audit.closedNote")}</p>
          <ul className="result-list">
            {report.items.map((it) => (
              <li key={it.id}>
                <span className="mono small">{it.asset.asset_tag}</span> {it.asset.name}{" "}
                <span className={`result ${it.result}`}>
                  {it.result === "found" ? t("audit.found") : it.result === "missing" ? t("audit.missing") : t("audit.unexpected")}
                </span>
                <span className="muted small"> ({t(`status.${it.asset.status}`)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
