"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleLogin(safeNext: string) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      router.push(safeNext);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 text-center">
        Masuk
      </h1>
      <p className="text-sm text-slate-500 text-center mb-6">
        Akses bookmark dan hafalan Anda.
      </p>
      {/* Only the ?next= reading needs Suspense — the form shell renders
          server-side so users see content immediately. */}
      <Suspense
        fallback={
          <LoginFormShell
            email={email}
            password={password}
            error={error}
            busy={busy}
            setEmail={setEmail}
            setPassword={setPassword}
            onSubmit={(e) => {
              e.preventDefault();
              void handleLogin("/me");
            }}
          />
        }
      >
        <LoginWithNext
          email={email}
          password={password}
          error={error}
          busy={busy}
          setEmail={setEmail}
          setPassword={setPassword}
          handleLogin={handleLogin}
        />
      </Suspense>
      <p className="text-center text-sm text-slate-600 mt-5">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="text-emerald-700 font-semibold hover:underline"
        >
          Daftar
        </Link>
      </p>
    </div>
  );
}

interface FormShellProps {
  email: string;
  password: string;
  error: string;
  busy: boolean;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function LoginFormShell({
  email,
  password,
  error,
  busy,
  setEmail,
  setPassword,
  onSubmit,
}: FormShellProps) {
  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-emerald-600 text-white py-3 font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition"
      >
        {busy ? "Memproses…" : "Masuk"}
      </button>
    </form>
  );
}

function LoginWithNext(props: Omit<FormShellProps, "onSubmit"> & {
  handleLogin: (next: string) => Promise<void>;
}) {
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get("next") ?? "/me";
  // Only allow same-origin paths in ?next= to prevent open redirect.
  const safeNext =
    nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/me";

  const { handleLogin, ...shellProps } = props;
  return (
    <LoginFormShell
      {...shellProps}
      onSubmit={(e) => {
        e.preventDefault();
        void handleLogin(safeNext);
      }}
    />
  );
}
