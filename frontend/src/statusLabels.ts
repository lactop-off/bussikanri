import type { AssetStatus } from "./types";

// ステータスの表示名は i18n の "status.<key>" を使う（t(`status.${s}`)）。
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
