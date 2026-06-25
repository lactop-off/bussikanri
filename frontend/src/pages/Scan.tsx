import { useState } from "react";
import Scanner from "../components/Scanner";
import { api, ApiError } from "../api";
import { useT } from "../i18n";
import { offlineQueue } from "../offline";
import type { AssetLookup } from "../types";
import { STATUS_CLASS, fmtDate } from "../statusLabels";

type Toast = { kind: "ok" | "err"; msg: string } | null;

// スキャン(ホーム)。資産を特定し、状態に応じて貸出/返却を1タップで提示（設計書 §10.2 / UC-1）。
export default function Scan() {
  const { t } = useT();
  const [asset, setAsset] = useState<AssetLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [scanning, setScanning] = useState(true);

  async function handleScan(tag: string) {
    setScanning(false);
    setBusy(true);
    setToast(null);
    try {
      const found = await api<AssetLookup>(`/assets/lookup?tag=${encodeURIComponent(tag)}`);
      setAsset(found);
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof ApiError ? e.message : t("scan.notFound") });
      setScanning(true);
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!asset) return;
    setBusy(true);
    try {
      if (!navigator.onLine) {
        offlineQueue.enqueue({
          kind: "checkout",
          path: `/assets/${asset.id}/checkout`,
          body: { borrower_id: "self" },
          label: `checkout: ${asset.name}`,
        });
        setToast({ kind: "ok", msg: t("scan.queued") });
      } else {
        await api(`/assets/${asset.id}/checkout`, { method: "POST", body: { borrower_id: "self" } });
        setToast({ kind: "ok", msg: t("scan.checkedOut", { name: asset.name }) });
      }
      reset();
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof ApiError ? e.message : t("scan.checkoutFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function checkin() {
    if (!asset) return;
    setBusy(true);
    try {
      if (!navigator.onLine) {
        offlineQueue.enqueue({
          kind: "checkin",
          path: `/assets/${asset.id}/checkin`,
          body: {},
          label: `checkin: ${asset.name}`,
        });
        setToast({ kind: "ok", msg: t("scan.queued") });
      } else {
        await api(`/assets/${asset.id}/checkin`, { method: "POST", body: {} });
        setToast({ kind: "ok", msg: t("scan.returned", { name: asset.name }) });
      }
      reset();
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof ApiError ? e.message : t("scan.checkinFailed") });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setAsset(null);
    setScanning(true);
  }

  return (
    <div className="scan-page">
      <h2>{t("scan.title")}</h2>
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}

      {scanning && !asset && <Scanner onScan={handleScan} />}

      {busy && !asset && <p className="muted">{t("scan.reading")}</p>}

      {asset && (
        <div className="asset-action card">
          <div className="asset-head">
            <h3>{asset.name}</h3>
            <span className={`status ${STATUS_CLASS[asset.status]}`}>{t(`status.${asset.status}`)}</span>
          </div>
          <p className="mono">{asset.asset_tag}</p>

          {asset.current_loan && (
            <p className="muted">
              {t("scan.borrowerDue", {
                name: asset.current_loan.borrower.name,
                due: fmtDate(asset.current_loan.due_at),
              })}
            </p>
          )}

          <div className="actions">
            {asset.status === "available" && (
              <button className="primary" onClick={checkout} disabled={busy}>
                {t("scan.checkout")}
              </button>
            )}
            {asset.status === "checked_out" && (
              <button className="primary" onClick={checkin} disabled={busy}>
                {t("scan.checkin")}
              </button>
            )}
            {asset.status !== "available" && asset.status !== "checked_out" && (
              <p className="error">{t("scan.cannotLend", { status: t(`status.${asset.status}`) })}</p>
            )}
            <button className="ghost" onClick={reset} disabled={busy}>
              {t("scan.scanAnother")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
