import { api } from "./api";

// 認証付きで API からファイル(PDF/CSV)を取得し、ブラウザでダウンロードさせる。
export async function downloadFile(path: string, filename: string, opts?: { method?: string; body?: unknown }) {
  const blob = await api<Blob>(path, { raw: true, method: opts?.method, body: opts?.body });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
