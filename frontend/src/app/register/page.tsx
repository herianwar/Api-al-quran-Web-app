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
      <h1 className="text-2xl font-bold mb-6 text-center">Daftar Akun</h1>
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-emerald-900/10 bg-white/60 p-6"
      >
        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Nama</label>
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className="w-full rounded-lg border border-emerald-900/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-emerald-900/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Password (min. 8 karakter)
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-emerald-900/15 bg-white/70 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 text-white py-2.5 font-semibold hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Memproses…" : "Daftar"}
        </button>
      </form>
      <p className="text-center text-sm text-emerald-900/60 mt-4">
        Sudah punya akun?{" "}
        <Link href="/login" className="text-emerald-700 font-medium hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
