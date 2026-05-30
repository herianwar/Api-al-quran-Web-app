"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await register(email, password, nama || undefined);
      router.push("/me");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mendaftar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 text-center">
        Daftar Akun
      </h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Mulai simpan bookmark dan hafalan Anda.
      </p>

      <form
        onSubmit={onSubmit}
        className="card p-6 space-y-4"
      >
        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
            {error}
          </p>
        )}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Nama
          </label>
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <p className="text-xs text-slate-500 mt-1">Minimal 8 karakter.</p>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 text-white py-3 font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition"
        >
          {busy ? "Memproses…" : "Daftar"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-600 mt-5">
        Sudah punya akun?{" "}
        <Link
          href="/login"
          className="text-emerald-700 font-semibold hover:underline"
        >
          Masuk
        </Link>
      </p>
    </div>
  );
}
