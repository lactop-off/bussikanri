// オフライン操作キュー（設計書 FR-3 / FR-5.5）。
// オフライン時の貸出/返却/棚卸スキャンを localStorage に退避し、復帰時に同期する。

import { api } from "./api";

export interface QueuedAction {
  id: string;
  kind: "checkout" | "checkin" | "audit_scan";
  path: string;
  body: unknown;
  label: string;
  queued_at: string;
}

const KEY = "krd_offline_queue";

function read(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: QueuedAction[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("krd-queue-change", { detail: items.length }));
}

export const offlineQueue = {
  count(): number {
    return read().length;
  },
  enqueue(action: Omit<QueuedAction, "id" | "queued_at">) {
    const items = read();
    items.push({ ...action, id: crypto.randomUUID(), queued_at: new Date().toISOString() });
    write(items);
  },
  async flush(): Promise<{ ok: number; failed: number }> {
    let items = read();
    let ok = 0;
    let failed = 0;
    const remaining: QueuedAction[] = [];
    for (const item of items) {
      try {
        await api(item.path, { method: "POST", body: item.body, retry: true });
        ok++;
      } catch (e) {
        // 4xx（業務エラー: 既に貸出済み等）は破棄、ネット系は残して再試行。
        const status = (e as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500) {
          failed++;
        } else {
          remaining.push(item);
        }
      }
    }
    write(remaining);
    return { ok, failed };
  },
};

// オンライン復帰時に自動フラッシュ。
export function setupAutoFlush() {
  window.addEventListener("online", () => {
    offlineQueue.flush();
  });
}
