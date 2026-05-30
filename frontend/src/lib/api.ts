import type { ApiMeta } from './types';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// Token storage strategy
// ----------------------
// • Access token lives ONLY in memory (this module's closure). It is never
//   persisted to localStorage so a successful XSS attack cannot steal it.
// • Refresh token is persisted to localStorage because (a) it needs to
//   survive full page reloads and (b) it's single-use (rotated server-side
//   on every refresh), limiting damage if it leaks.
// • On boot, if a refresh token exists, the client trades it for a fresh
//   access token via /auth/refresh before any authenticated request runs.
const REFRESH_KEY = 'quran_refresh_token';

let accessToken: string | null = null;
const accessSubscribers = new Set<(token: string | null) => void>();

function notifyAccessChange(): void {
  for (const fn of accessSubscribers) fn(accessToken);
}

export const tokenStore = {
  get access(): string | null {
    return accessToken;
  },
  get refresh(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string): void {
    accessToken = access;
    if (typeof window !== 'undefined') {
      localStorage.setItem(REFRESH_KEY, refresh);
    }
    notifyAccessChange();
  },
  setAccess(access: string): void {
    accessToken = access;
    notifyAccessChange();
  },
  clear(): void {
    accessToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(REFRESH_KEY);
    }
    notifyAccessChange();
  },
  /** Subscribe to access-token changes; returns an unsubscribe fn. */
  subscribe(fn: (token: string | null) => void): () => void {
    accessSubscribers.add(fn);
    return () => accessSubscribers.delete(fn);
  },
};

interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: ApiMeta;
  error?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = tokenStore.access;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

/**
 * Exchange the persisted refresh token for a fresh access token. Coalesces
 * concurrent calls so that a burst of requests with an expired access token
 * triggers a single /auth/refresh call (avoids race where two requests both
 * spend the single-use refresh token and one ends up logged out).
 */
let inflightRefresh: Promise<boolean> | null = null;

export function tryRefresh(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    const refresh = tokenStore.refresh;
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as Envelope<{
        accessToken: string;
        refreshToken: string;
      }>;
      if (!body.success) return false;
      tokenStore.set(body.data.accessToken, body.data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<ApiResponse<T>> {
  // After a page reload the access token (memory-only) is gone but the
  // refresh token (localStorage) is still there. Mint a new access token
  // up-front rather than wait for the request to fail with 401.
  if (!tokenStore.access && tokenStore.refresh && retry) {
    await tryRefresh();
  }
  let res = await rawFetch(path, init);

  if (res.status === 401 && retry && tokenStore.refresh) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawFetch(path, init);
    }
  }

  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError('Gagal membaca respons server', res.status);
  }

  if (!res.ok || !body.success) {
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(
      body?.message ?? 'Terjadi kesalahan',
      res.status,
      body?.error,
    );
  }
  return { data: body.data, meta: body.meta };
}

/** SWR fetcher returning only the data payload. */
export const fetcher = <T>(path: string): Promise<T> =>
  apiFetch<T>(path).then((r) => r.data);

/** SWR fetcher returning the full response (with meta). */
export const fetcherFull = <T>(path: string): Promise<ApiResponse<T>> =>
  apiFetch<T>(path);

/**
 * Same auth/refresh handling as `apiFetch` but returns the raw `Response`.
 * Use this for binary downloads (e.g. blob) where the standard JSON
 * envelope wrapper doesn't apply.
 */
export async function apiFetchRaw(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  if (!tokenStore.access && tokenStore.refresh && retry) {
    await tryRefresh();
  }
  let res = await rawFetch(path, init);
  if (res.status === 401 && retry && tokenStore.refresh) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await rawFetch(path, init);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      msg = body?.message ?? msg;
    } catch {
      /* response wasn't JSON */
    }
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(msg, res.status);
  }
  return res;
}
