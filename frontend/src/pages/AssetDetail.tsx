import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { downloadFile } from "../download";
import { canManage, useAuth } from "../auth";
import type { Asset, Loan, MaintenanceRecord, Page } from "../types";
import { STATUS_LABEL, STATUS_CLASS, fmtDate } from "../statusLabels";

const MAINT_TYPE: Record<string, string> = {
  inspection: "点検",
  repair: "修理",
  calibration: "校正",
};
const MAINT_STATUS: Record<string, string> = { open: "受付", in_progress: "対応中", done: "完了" };

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const manager = canManage(user);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [maint, setMaint] = useState<MaintenanceRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showMaint, setShowMaint] = useState(false);

  async function load() {
    if (!id) return;
    setAsset(await api<Asset>(`/assets/${id}`));
    if (manager) {
      const lp = await api<Page<Loan>>(`/loans?scope=all&asset_id=${id}&size=50`);
      setLoans(lp.items);
      setMaint(await api<MaintenanceRecord[]>(`/maintenance?asset_id=${id}`));
    }
  }

  useEffect(() => {
    load().catch((e) => setToast(e instanceof ApiError ? e.message : "読み込みに失敗しました"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function downloadLabel() {
    if (!asset) return;
    await downloadFile(`/labels`, `label-${asset.asset_tag}.pdf`, {
      method: "POST",
      body: { asset_ids: [asset.id], layout: "a-one-65" },
    });
  }

  async function completeMaint(recId: string) {
    await api(`/maintenance/${recId}`, { method: "PATCH", body: { status: "done" } });
    await load();
  }

  if (!asset) return <div className="muted">{toast ?? "読み込み中…"}</div>;

  return (
    <div className="asset-detail">
      <button className="ghost small" onClick={() => nav(-1)}>
        ← 戻る
      </button>
      {toast && <div className="toast err">{toast}</div>}

      <div className="card">
        <div className="asset-head">
          <h2>{asset.name}</h2>
          <span className={`status ${STATUS_CLASS[asset.status]}`}>{STATUS_LABEL[asset.status]}</span>
        </div>
        <p className="mono">{asset.asset_tag}</p>
        <dl className="spec">
          <Spec k="メーカー" v={asset.manufacturer} />
          <Spec k="型番" v={asset.model} />
          <Spec k="シリアル番号" v={asset.serial_no} />
          <Spec k="取得日" v={asset.purchase_date && fmtDate(asset.purchase_date)} />
          <Spec k="取得価格" v={asset.purchase_price ? `¥${asset.purchase_price.toLocaleString()}` : null} />
          <Spec k="保証期限" v={asset.warranty_until && fmtDate(asset.warranty_until)} />
          <Spec k="備考" v={asset.notes} />
        </dl>
        {manager && (
          <div className="actions row-actions">
            <button className="ghost small" onClick={downloadLabel}>
              🏷 ラベルPDF
            </button>
            {asset.status === "available" && (
              <button className="ghost small" onClick={() => setShowMaint(true)}>
                🔧 メンテ受付
              </button>
            )}
          </div>
        )}
      </div>

      {manager && (
        <>
          <h3>貸出履歴（{loans.length}）</h3>
          {loans.length === 0 && <p className="muted">履歴はありません。</p>}
          <ul className="loan-list">
            {loans.map((ln) => (
              <li key={ln.id} className="card small">
                <div className="asset-head">
                  <strong>{ln.borrower.name}</strong>
                  <span className={ln.checkin_at ? "muted" : "status busy"}>
                    {ln.checkin_at ? "返却済" : "貸出中"}
                  </span>
                </div>
                <p className="muted small">
                  {fmtDate(ln.checkout_at)} → {ln.checkin_at ? fmtDate(ln.checkin_at) : `期限 ${fmtDate(ln.due_at)}`}
                </p>
              </li>
            ))}
          </ul>

          <h3>メンテナンス履歴（{maint.length}）</h3>
          {maint.length === 0 && <p className="muted">履歴はありません。</p>}
          <ul className="loan-list">
            {maint.map((m) => (
              <li key={m.id} className="card small">
                <div className="asset-head">
                  <strong>
                    {MAINT_TYPE[m.type]} ・ {MAINT_STATUS[m.status]}
                  </strong>
                  {m.status !== "done" && (
                    <button className="primary small" onClick={() => completeMaint(m.id)}>
                      完了にする
                    </button>
                  )}
                </div>
                <p className="muted small">
                  受付 {m.reported_at ? fmtDate(m.reported_at) : "—"}
                  {m.vendor && ` ・ ${m.vendor}`}
                  {m.cost ? ` ・ ¥${m.cost.toLocaleString()}` : ""}
                </p>
                {m.description && <p className="small">{m.description}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {showMaint && (
        <MaintenanceModal
          assetId={asset.id}
          onClose={() => setShowMaint(false)}
          onSaved={() => {
            setShowMaint(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function MaintenanceModal({
  assetId,
  onClose,
  onSaved,
}: {
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState("inspection");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/maintenance", {
        method: "POST",
        body: { asset_id: assetId, type, vendor: vendor || null, description: description || null },
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>メンテナンス受付</h3>
        <form onSubmit={submit}>
          <label>
            種別
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="inspection">点検</option>
              <option value="repair">修理</option>
              <option value="calibration">校正</option>
            </select>
          </label>
          <label>
            業者
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </label>
          <label>
            内容
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              受付（資産はメンテ中になります）
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
