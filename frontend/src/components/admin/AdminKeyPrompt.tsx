"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { setAdminKey } from "@/app/admin/_lib/admin-key";

/**
 * Reusable prompt for pages that need SEED_ADMIN_KEY. Calls onSaved after
 * the user submits so the parent can re-render with the key available.
 */
export function AdminKeyPrompt({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setAdminKey(value.trim());
    onSaved();
  }

  return (
    <div className="card p-6 max-w-md">
      <div className="flex items-center gap-2 mb-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 text-amber-700">
          <KeyRound size={18} />
        </span>
        <h2 className="font-semibold text-slate-900">
          Butuh Seed Admin Key
        </h2>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Halaman ini diakses dengan{" "}
        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
          SEED_ADMIN_KEY
        </code>{" "}
        dari{" "}
        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
          .env
        </code>{" "}
        backend. Disimpan di sessionStorage (hilang saat tab tutup).
      </p>
      <form onSubmit={save} className="flex gap-2">
        <input
          type="password"
          autoFocus
          placeholder="Paste key di sini…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
        >
          Simpan
        </button>
      </form>
    </div>
  );
}
