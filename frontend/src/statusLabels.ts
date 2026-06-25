import type { AssetStatus } from "./types";

export const STATUS_LABEL: Record<AssetStatus, string> = {
  available: "利用可",
  checked_out: "貸出中",
  under_maintenance: "メンテ中",
  retired: "廃棄",
  lost: "紛失",
};

export const STATUS_CLASS: Record<AssetStatus, string> = {
  available: "ok",
  checked_out: "busy",
  under_maintenance: "warn",
  retired: "muted",
  lost: "danger",
};

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
