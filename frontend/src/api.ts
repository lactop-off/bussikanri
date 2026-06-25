// API クライアント。JWT を保持し、access の失効時は refresh で自動更新する。

const BASE = "/api/v1";

const ACCESS_KEY = "krd_access";
const REFRESH_KEY = "krd_refresh";

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function refreshAccess(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  const resp = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!resp.ok) return false;
  const data = await resp.json();
  tokens.set(data.access_token, data.refresh_token);
  return true;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  raw?: boolean; // バイナリ(Blob)レスポンス
  retry?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (tokens.access) headers["Authorization"] = `Bearer ${tokens.access}`;

  const resp = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body:
      opts.body === undefined
        ? undefined
        : opts.body instanceof FormData
        ? opts.body
        : JSON.stringify(opts.body),
  });

  if (resp.status === 401 && opts.retry !== false && (await refreshAccess())) {
    return api<T>(path, { ...opts, retry: false });
  }

  if (opts.raw) {
    if (!resp.ok) throw await toError(resp);
    return (await resp.blob()) as unknown as T;
  }

  if (resp.status === 204) return undefined as T;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = (data as { error?: { code: string; message: string } }).error;
    throw new ApiError(resp.status, err?.code ?? "ERROR", err?.message ?? "エラーが発生しました");
  }
  return data as T;
}

async function toError(resp: Response): Promise<ApiError> {
  const data = await resp.json().catch(() => ({}));
  const err = (data as { error?: { code: string; message: string } }).error;
  return new ApiError(resp.status, err?.code ?? "ERROR", err?.message ?? "エラー");
}

export async function login(email: string, password: string) {
  const resp = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = (data as { error?: { code: string; message: string } }).error;
    throw new ApiError(resp.status, err?.code ?? "ERROR", err?.message ?? "ログインに失敗しました");
  }
  tokens.set(data.access_token, data.refresh_token);
}
