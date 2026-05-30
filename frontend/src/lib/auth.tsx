'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSWRConfig } from 'swr';
import { apiFetch, tokenStore, tryRefresh } from './api';
import type { AuthResult, User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    nama?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Refresh proactively this many ms before the access token expiry. JWT exp
// is in seconds; we trigger refresh at exp - 60s so latency never causes
// an unauthenticated request to hit the API.
const REFRESH_LEAD_MS = 60_000;

interface JwtClaims {
  exp?: number;
}

function decodeJwtExpiryMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded);
    const claims = JSON.parse(json) as JwtClaims;
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // SWR config gives us access to its global cache — needed to invalidate
  // every per-user key (bookmarks, hafalan, admin/*) on logout so a next
  // user that signs in doesn't see the previous user's data flash.
  const { mutate: swrMutate } = useSWRConfig();

  const refreshUser = useCallback(async () => {
    // If access is missing but refresh exists (e.g., after a hard reload
    // since the access token is memory-only now), mint a new access first.
    // If the refresh itself fails, the stored refresh token is no longer
    // useful — clear it so we don't loop on every page load.
    if (!tokenStore.access && tokenStore.refresh) {
      const ok = await tryRefresh();
      if (!ok) tokenStore.clear();
    }
    if (!tokenStore.access) {
      setUser(null);
      return;
    }
    try {
      const { data } = await apiFetch<User>('/user/profile');
      setUser(data);
    } catch {
      // apiFetch already clears tokens on 401; for other errors we keep
      // the tokens (network blip) but null out the user so the UI shows
      // a logged-out state until the next attempt.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  // Schedule proactive refresh whenever the access token changes. This
  // prevents a stale token from being sent (and getting a 401) right
  // before expiry under flaky network conditions.
  useEffect(() => {
    const schedule = (token: string | null) => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (!token) return;
      const expMs = decodeJwtExpiryMs(token);
      if (!expMs) return;
      const fireIn = expMs - Date.now() - REFRESH_LEAD_MS;
      if (fireIn <= 0) {
        void tryRefresh();
        return;
      }
      refreshTimerRef.current = setTimeout(() => {
        void tryRefresh();
      }, fireIn);
    };
    schedule(tokenStore.access);
    const unsub = tokenStore.subscribe(schedule);
    return () => {
      unsub();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apiFetch<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, nama?: string) => {
      const { data } = await apiFetch<AuthResult>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, nama }),
      });
      tokenStore.set(data.accessToken, data.refreshToken);
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    const refresh = tokenStore.refresh;
    if (refresh) {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: refresh }),
      }).catch(() => undefined);
    }
    tokenStore.clear();
    setUser(null);
    // Wipe every cached per-user response. Pass `undefined` as data and
    // `revalidate: false` so currently-mounted SWR hooks drop their data
    // immediately rather than trying to refetch with no auth.
    await swrMutate(
      (key) =>
        typeof key === 'string' &&
        (key.startsWith('/user/') || key.startsWith('/admin/')),
      undefined,
      { revalidate: false },
    );
  }, [swrMutate]);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
