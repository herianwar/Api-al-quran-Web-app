// Helpers for admin pages that hit endpoints protected by the
// SEED_ADMIN_KEY rather than the JWT admin role. The key is stored in
// sessionStorage so it persists across page navigation within the tab but
// is gone when the tab closes.

export const API_BASE =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:3000/api/v1";

export function getAdminKey(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("seed_admin_key") ?? "";
}

export function setAdminKey(key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("seed_admin_key", key);
}

export async function adminFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const key = getAdminKey();
  if (!key) throw new Error("SEED_ADMIN_KEY belum di-set");
  const r = await fetch(API_BASE + path, {
    ...init,
    headers: {
      "x-seed-admin-key": key,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const body = await r.json();
      msg = body.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}
