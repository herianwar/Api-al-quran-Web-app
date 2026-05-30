"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { API_URL } from "@/lib/api";

const SESSION_KEY = "rumahquran:visitorSessionId";
const LAST_REFERER_KEY = "rumahquran:lastReferer";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    const buf = new Uint8Array(8);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(buf);
    } else {
      for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    id = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/**
 * Fires a POST /analytics/pageview on every Next.js route change. The
 * tracker is fire-and-forget — failures never block navigation. Auth token
 * (if present) is attached so logged-in views get attributed.
 */
export function AnalyticsTracker(): null {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    // De-dup repeated fires for the same path within the same React render
    // cycle. Real navigation changes pathname so this only blocks no-op
    // re-renders triggered by SWR/state churn.
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const referer =
      typeof document !== "undefined"
        ? document.referrer || sessionStorage.getItem(LAST_REFERER_KEY) || ""
        : "";

    // Skip admin routes — they are gated and the team doesn't want to see
    // their own dashboard time inflate the public numbers.
    if (pathname.startsWith("/admin")) return;

    const sessionId = getOrCreateSessionId();
    const body = JSON.stringify({
      path: pathname,
      sessionId,
      referer: referer.slice(0, 500),
    });

    // Stash the current page as next-hop referer so we don't lose internal
    // navigation chains (document.referrer is empty for client-side route
    // changes in SPAs).
    try {
      sessionStorage.setItem(
        LAST_REFERER_KEY,
        `${window.location.origin}${pathname}`,
      );
    } catch {
      /* private mode — ignore */
    }

    // Prefer sendBeacon for fire-and-forget; fall back to fetch with
    // keepalive so the request survives page-unload navigations.
    const url = `${API_URL}/analytics/pageview`;
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const ok = navigator.sendBeacon(url, blob);
        if (ok) return;
      }
    } catch {
      /* fall through to fetch */
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
