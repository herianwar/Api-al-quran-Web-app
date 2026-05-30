"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

/**
 * Lightweight refresh control for SWR-backed admin pages. Pass an `onRefresh`
 * that calls every relevant `mutate()` (Promise.all is fine). The icon spins
 * while in flight and a small minimum delay prevents a jarring flash on fast
 * refetches.
 */
export function RefreshButton({
  onRefresh,
  label = "Muat ulang",
}: {
  onRefresh: () => void | Promise<unknown>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (busy) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      // Keep the spinner visible for at least 400ms so the user sees feedback
      // even when the cached data refetches in <100ms.
      setTimeout(() => setBusy(false), 400);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50 transition shadow-sm"
    >
      <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
