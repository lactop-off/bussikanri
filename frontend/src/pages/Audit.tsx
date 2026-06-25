import { useEffect, useState } from "react";
import Scanner from "../components/Scanner";
import { api } from "../api";
import { offlineQueue } from "../offline";
import type { AuditReport } from "../types";
import { STATUS_LABEL } from "../statusLabels";

// 棚卸モード（設計書 FR-5 / §10.3）。連続スキャンで台帳照合、オフライン退避対応。
export default function Audit() {
  const [audits, setAudits] = useState<{ id: string; name: string; status: string }[]>([]);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [name, setName] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  async function loadList() {
    setAudits(await api("/audits"));
  }

  useEffect(() => {
    loadList();
  }, []);

  async function create() {
    if (!name.trim()) return;
    const a = await api<{ id: string }>("/audits", {
      method: "POST",
      body: { name: name.trim(), scope: "all" },
    });
    setName("");
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
        label: `棚卸スキャン: ${tag}`,
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
    if (!confirm("棚卸を締めます。未スキャンの資産は欠品として確定されます。よろしいですか？")) return;
    const final = await api<AuditReport>(`/audits/${report.audit.id}/close`, { method: "POST", body: {} });
    setReport(final);
    await loadList();
  }

  if (!report) {
    return (
      <div className="audit">
        <h2>棚卸</h2>
        <div className="card">
          <h3>新規棚卸（全体）</h3>
          <div className="manual">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="棚卸名（例: 2026年6月 会議室A）" />
            <button onClick={create}>開始</button>
          </div>
        </div>
        <h3>過去の棚卸</h3>
        <ul className="audit-list">
          {audits.map((a) => (
            <li key={a.id} className="card row" onClick={() => open(a.id)}>
              <strong>{a.name}</strong>
              <span className={a.status === "closed" ? "muted" : "status busy"}>
                {a.status === "closed" ? "締済" : "実施中"}
              </span>
            </li>
          ))}
          {audits.length === 0 && <p className="muted">棚卸はまだありません。</p>}
        </ul>
      </div>
    );
  }

  const open_ = report.audit.status === "open";
  return (
    <div className="audit">
      <div className="page-head">
        <h2>{report.audit.name}</h2>
        <button className="ghost small" onClick={() => setReport(null)}>
          ← 一覧
        </button>
      </div>

      <div className="audit-stats">
        <span className="stat ok">発見 {report.found}</span>
        <span className="stat danger">欠品 {report.missing}</span>
        <span className="stat warn">想定外 {report.unexpected}</span>
      </div>

      {open_ ? (
        <>
          <Scanner onScan={onScan} continuous cooldownMs={1200} />
          {recent.length > 0 && (
            <div className="recent">
              <p className="muted small">直近スキャン</p>
              <ul>
                {recent.map((t, i) => (
                  <li key={i} className="mono small">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="primary block" onClick={close}>
            棚卸を締める
          </button>
        </>
      ) : (
        <div className="card">
          <p className="muted">この棚卸は締め済みです。結果:</p>
          <ul className="result-list">
            {report.items.map((it) => (
              <li key={it.id}>
                <span className="mono small">{it.asset.asset_tag}</span> {it.asset.name}{" "}
                <span className={`result ${it.result}`}>
                  {it.result === "found" ? "発見" : it.result === "missing" ? "欠品" : "想定外"}
                </span>
                <span className="muted small"> ({STATUS_LABEL[it.asset.status]})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
