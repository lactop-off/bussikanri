import { useState } from "react";
import Scanner from "../components/Scanner";
import { api, ApiError } from "../api";
import { offlineQueue } from "../offline";
import type { AssetLookup } from "../types";
import { STATUS_LABEL, STATUS_CLASS, fmtDate } from "../statusLabels";

type Toast = { kind: "ok" | "err"; msg: string } | null;

// スキャン(ホーム)。資産を特定し、状態に応じて貸出/返却を1タップで提示（設計書 §10.2 / UC-1）。
export default function Scan() {
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
      setToast({ kind: "err", msg: e instanceof ApiError ? e.message : "資産が見つかりません" });
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
          label: `貸出: ${asset.name}`,
        });
        setToast({ kind: "ok", msg: "オフラインのため保留しました（復帰時に同期）" });
      } else {
        await api(`/assets/${asset.id}/checkout`, { method: "POST", body: { borrower_id: "self" } });
        setToast({ kind: "ok", msg: `「${asset.name}」を貸出しました` });
      }
      reset();
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof ApiError ? e.message : "貸出に失敗しました" });
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
          label: `返却: ${asset.name}`,
        });
        setToast({ kind: "ok", msg: "オフラインのため保留しました（復帰時に同期）" });
      } else {
        await api(`/assets/${asset.id}/checkin`, { method: "POST", body: {} });
        setToast({ kind: "ok", msg: `「${asset.name}」を返却しました` });
      }
      reset();
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof ApiError ? e.message : "返却に失敗しました" });
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
      <h2>スキャン</h2>
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}

      {scanning && !asset && <Scanner onScan={handleScan} />}

      {busy && !asset && <p className="muted">読み取り中…</p>}

      {asset && (
        <div className="asset-action card">
          <div className="asset-head">
            <h3>{asset.name}</h3>
            <span className={`status ${STATUS_CLASS[asset.status]}`}>{STATUS_LABEL[asset.status]}</span>
          </div>
          <p className="mono">{asset.asset_tag}</p>

          {asset.current_loan && (
            <p className="muted">
              借用者: {asset.current_loan.borrower.name} / 返却期限 {fmtDate(asset.current_loan.due_at)}
            </p>
          )}

          <div className="actions">
            {asset.status === "available" && (
              <button className="primary" onClick={checkout} disabled={busy}>
                借りる（貸出）
              </button>
            )}
            {asset.status === "checked_out" && (
              <button className="primary" onClick={checkin} disabled={busy}>
                返す（返却）
              </button>
            )}
            {asset.status !== "available" && asset.status !== "checked_out" && (
              <p className="error">この資産は現在貸出できません（{STATUS_LABEL[asset.status]}）</p>
            )}
            <button className="ghost" onClick={reset} disabled={busy}>
              別の資産をスキャン
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
