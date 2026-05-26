import type { ApiMeta } from './types';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const ACCESS_KEY = 'quran_access_token';
const REFRESH_KEY = 'quran_refresh_token';

export const tokenStore = {
  get access() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    if (typeof window === 'undefined') return null;
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

async function tryRefresh(): Promise<boolean> {
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
  }
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
