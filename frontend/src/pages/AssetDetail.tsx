import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { downloadFile } from "../download";
import { canManage, useAuth } from "../auth";
import { useT } from "../i18n";
import type { Asset, Loan, MaintenanceRecord, Page } from "../types";
import { STATUS_CLASS, fmtDate } from "../statusLabels";

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useT();
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
    load().catch((e) => setToast(e instanceof ApiError ? e.message : t("common.loadFailed")));
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

  if (!asset) return <div className="muted">{toast ?? t("common.loading")}</div>;

  return (
    <div className="asset-detail">
      <button className="ghost small" onClick={() => nav(-1)}>
        ← {t("common.back")}
      </button>
      {toast && <div className="toast err">{toast}</div>}

      <div className="card">
        <div className="asset-head">
          <h2>{asset.name}</h2>
          <span className={`status ${STATUS_CLASS[asset.status]}`}>{t(`status.${asset.status}`)}</span>
        </div>
        <p className="mono">{asset.asset_tag}</p>
        <dl className="spec">
          <Spec k={t("assets.manufacturer")} v={asset.manufacturer} />
          <Spec k={t("assets.model")} v={asset.model} />
          <Spec k={t("assets.serial")} v={asset.serial_no} />
          <Spec k={t("detail.purchaseDate")} v={asset.purchase_date && fmtDate(asset.purchase_date)} />
          <Spec k={t("detail.purchasePrice")} v={asset.purchase_price ? `¥${asset.purchase_price.toLocaleString()}` : null} />
          <Spec k={t("detail.warranty")} v={asset.warranty_until && fmtDate(asset.warranty_until)} />
          <Spec k={t("detail.notes")} v={asset.notes} />
        </dl>
        {manager && (
          <div className="actions row-actions">
            <button className="ghost small" onClick={downloadLabel}>
              🏷 {t("detail.label")}
            </button>
            {asset.status === "available" && (
              <button className="ghost small" onClick={() => setShowMaint(true)}>
                🔧 {t("detail.maintReceive")}
              </button>
            )}
          </div>
        )}
      </div>

      {manager && (
        <>
          <h3>{t("detail.loanHistory", { n: loans.length })}</h3>
          {loans.length === 0 && <p className="muted">{t("detail.noHistory")}</p>}
          <ul className="loan-list">
            {loans.map((ln) => (
              <li key={ln.id} className="card small">
                <div className="asset-head">
                  <strong>{ln.borrower.name}</strong>
                  <span className={ln.checkin_at ? "muted" : "status busy"}>
                    {ln.checkin_at ? t("detail.returned") : t("loans.checkedOut")}
                  </span>
                </div>
                <p className="muted small">
                  {fmtDate(ln.checkout_at)} → {ln.checkin_at ? fmtDate(ln.checkin_at) : fmtDate(ln.due_at)}
                </p>
              </li>
            ))}
          </ul>

          <h3>{t("detail.maintHistory", { n: maint.length })}</h3>
          {maint.length === 0 && <p className="muted">{t("detail.noHistory")}</p>}
          <ul className="loan-list">
            {maint.map((m) => (
              <li key={m.id} className="card small">
                <div className="asset-head">
                  <strong>
                    {t(`maint.${m.type}`)} ・ {t(`maint.${m.status}`)}
                  </strong>
                  {m.status !== "done" && (
                    <button className="primary small" onClick={() => completeMaint(m.id)}>
                      {t("detail.markDone")}
                    </button>
                  )}
                </div>
                <p className="muted small">
                  {m.reported_at ? fmtDate(m.reported_at) : "—"}
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
  const { t } = useT();
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
        <h3>{t("detail.maintTitle")}</h3>
        <form onSubmit={submit}>
          <label>
            {t("detail.maintType")}
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="inspection">{t("maint.inspection")}</option>
              <option value="repair">{t("maint.repair")}</option>
              <option value="calibration">{t("maint.calibration")}</option>
            </select>
          </label>
          <label>
            {t("detail.maintVendor")}
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </label>
          <label>
            {t("detail.maintContent")}
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              {t("detail.maintSubmit")}
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
