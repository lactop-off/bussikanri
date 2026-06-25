import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { downloadFile } from "../download";
import { canManage, useAuth } from "../auth";
import type { Asset, Page } from "../types";
import { STATUS_LABEL, STATUS_CLASS, fmtDate } from "../statusLabels";

export default function Assets() {
  const { user } = useAuth();
  const manager = canManage(user);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Page<Asset> | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api<{ created: number; skipped: number; errors: string[] }>("/imports/assets", {
        method: "POST",
        body: fd,
      });
      setImportMsg(`登録 ${r.created} 件 / スキップ ${r.skipped} 件${r.errors.length ? ` / エラー ${r.errors.length}` : ""}`);
      setPage(1);
      load();
    } catch (err) {
      setImportMsg((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function load() {
    const params = new URLSearchParams({ page: String(page), size: "20" });
    if (q) params.set("q", q);
    setData(await api<Page<Asset>>(`/assets?${params}`));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <div className="assets">
      <div className="page-head">
        <h2>資産一覧</h2>
        {manager && (
          <button className="primary small" onClick={() => setCreating(true)}>
            ＋ 登録
          </button>
        )}
      </div>

      {manager && (
        <div className="toolbar">
          <button className="ghost small" onClick={() => downloadFile("/reports/assets.csv", "assets.csv")}>
            ⬇ CSV出力
          </button>
          <button className="ghost small" onClick={() => fileRef.current?.click()}>
            ⬆ CSV取込
          </button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={onImport} />
        </div>
      )}
      {importMsg && <div className="toast ok">{importMsg}</div>}

      <form className="manual" onSubmit={search}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名称 / 管理番号 / 型番で検索" />
        <button type="submit">検索</button>
      </form>

      {data && <p className="muted small">{data.total} 件</p>}

      <ul className="asset-list">
        {data?.items.map((a) => (
          <li key={a.id} className="card">
            <Link to={`/assets/${a.id}`} className="card-link">
              <div className="asset-head">
                <strong>{a.name}</strong>
                <span className={`status ${STATUS_CLASS[a.status]}`}>{STATUS_LABEL[a.status]}</span>
              </div>
              <p className="mono small">{a.asset_tag}</p>
              <p className="muted small">
                {[a.manufacturer, a.model].filter(Boolean).join(" ") || "—"}
                {a.warranty_until && ` ・ 保証 ${fmtDate(a.warranty_until)}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div className="pager">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            前へ
          </button>
          <span>
            {page} / {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            次へ
          </button>
        </div>
      )}

      {creating && <CreateAssetModal onClose={() => setCreating(false)} onCreated={load} />}
    </div>
  );
}

function CreateAssetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", asset_tag: "", manufacturer: "", model: "", serial_no: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = { name: form.name };
      for (const k of ["asset_tag", "manufacturer", "model", "serial_no"] as const) {
        if (form[k]) body[k] = form[k];
      }
      await api("/assets", { method: "POST", body });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>資産を登録</h3>
        <form onSubmit={submit}>
          <label>
            名称 *
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            管理番号（空欄で自動採番）
            <input
              value={form.asset_tag}
              onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
              placeholder="KRD-000123"
            />
          </label>
          <label>
            メーカー
            <input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
          </label>
          <label>
            型番
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </label>
          <label>
            シリアル番号
            <input value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              登録
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
