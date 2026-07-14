"use client";

import { BookOpen, Flame, Target, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { KhatamProgress, ReadingGoal, ReadingStreak } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

function todayIso(): string {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  return wib.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function TilawahPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [target, setTarget] = useState(10);
  const [unit, setUnit] = useState("ayat");
  const [savingGoal, setSavingGoal] = useState(false);

  const [khatamTarget, setKhatamTarget] = useState(addDays(todayIso(), 30));
  const [savingKhatam, setSavingKhatam] = useState(false);

  const [logAyat, setLogAyat] = useState(1);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const { data: streak, mutate: mutateStreak } = useSWR<ReadingStreak>(
    user ? "/me/streak" : null,
    fetcher,
  );
  const { data: goal, mutate: mutateGoal } = useSWR<ReadingGoal>(
    user ? "/me/goal" : null,
    fetcher,
  );
  const { data: khatam, mutate: mutateKhatam } = useSWR<KhatamProgress | null>(
    user ? "/me/khatam" : null,
    fetcher,
  );

  useEffect(() => {
    if (goal) {
      setTarget(goal.target);
      setUnit(goal.unit);
    }
  }, [goal]);

  if (loading || !user) return <Spinner label="Memuat…" />;

  async function saveGoal() {
    setSavingGoal(true);
    await apiFetch("/me/goal", {
      method: "PUT",
      body: JSON.stringify({ unit, target }),
    }).catch(() => undefined);
    await mutateGoal();
    setSavingGoal(false);
  }

  async function saveKhatam() {
    setSavingKhatam(true);
    await apiFetch("/me/khatam", {
      method: "PUT",
      body: JSON.stringify({ mulai: todayIso(), targetTanggal: khatamTarget }),
    }).catch(() => undefined);
    await mutateKhatam();
    setSavingKhatam(false);
  }

  async function hapusKhatam() {
    if (!confirm("Hapus rencana khatam?")) return;
    await apiFetch("/me/khatam", { method: "DELETE" }).catch(() => undefined);
    await mutateKhatam();
  }

  async function logBaca() {
    await apiFetch("/me/reading-session", {
      method: "POST",
      body: JSON.stringify({ tanggal: todayIso(), ayatCount: logAyat }),
    }).catch(() => undefined);
    setLogAyat(1);
    await Promise.all([mutateStreak(), mutateKhatam()]);
  }

  const todayCount = streak?.todayCount ?? 0;
  const goalReached = todayCount >= target;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center">
          <BookOpen size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Target Tilawah</h1>
          <p className="text-sm text-slate-500">
            Jaga konsistensi baca harian & rencanakan khatam.
          </p>
        </div>
      </header>

      {/* Streak + hari ini */}
      <section className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <Flame size={18} className="mx-auto text-amber-500 fill-amber-400" />
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {streak?.current ?? 0}
          </p>
          <p className="text-xs text-slate-500">streak</p>
        </div>
        <div className="card p-4 text-center">
          <Trophy size={18} className="mx-auto text-emerald-600" />
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {streak?.longest ?? 0}
          </p>
          <p className="text-xs text-slate-500">terpanjang</p>
        </div>
        <div className="card p-4 text-center">
          <Target size={18} className="mx-auto text-sky-600" />
          <p
            className={`text-2xl font-bold mt-1 ${goalReached ? "text-emerald-600" : "text-slate-900"}`}
          >
            {todayCount}
          </p>
          <p className="text-xs text-slate-500">ayat hari ini</p>
        </div>
      </section>

      {/* Catat baca cepat */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Catat tilawah hari ini</h2>
        <p className="text-xs text-slate-500 mb-3">
          Target harian: {target} {unit}.{" "}
          {goalReached ? (
            <span className="text-emerald-700 font-medium">Tercapai! 🎉</span>
          ) : (
            <span>Kurang {Math.max(0, target - todayCount)} lagi.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1000}
            value={logAyat}
            onChange={(e) =>
              setLogAyat(Math.max(1, parseInt(e.target.value || "1", 10)))
            }
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            onClick={logBaca}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition"
          >
            + Catat ayat
          </button>
        </div>
      </section>

      {/* Set target harian */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Target harian</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="text-slate-600">Jumlah</span>
            <input
              type="number"
              min={1}
              max={30}
              value={target}
              onChange={(e) =>
                setTarget(Math.max(1, parseInt(e.target.value || "1", 10)))
              }
              className="mt-1 block w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Satuan</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="ayat">ayat</option>
              <option value="halaman">halaman</option>
              <option value="juz">juz</option>
            </select>
          </label>
          <button
            onClick={saveGoal}
            disabled={savingGoal}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {savingGoal ? "…" : "Simpan"}
          </button>
        </div>
      </section>

      {/* Khatam plan */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Rencana Khatam</h2>
        {khatam ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-emerald-700">
                {khatam.persen}%
              </p>
              <p className="text-sm text-slate-500">
                {khatam.ayatDibaca.toLocaleString("id-ID")} /{" "}
                {khatam.totalAyat.toLocaleString("id-ID")} ayat
              </p>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${khatam.persen}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Target/hari</p>
                <p className="font-semibold text-slate-900">
                  {khatam.targetPerHariSisa} ayat
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Sisa waktu</p>
                <p className="font-semibold text-slate-900">
                  {Math.max(0, khatam.sisaHari)} hari
                </p>
              </div>
            </div>
            <p
              className={`text-sm font-medium ${
                khatam.selesai
                  ? "text-emerald-700"
                  : khatam.onTrack
                    ? "text-emerald-700"
                    : "text-amber-600"
              }`}
            >
              {khatam.selesai
                ? "Alhamdulillah, khatam tercapai! 🎉"
                : khatam.onTrack
                  ? "✓ Kamu on-track, pertahankan!"
                  : "⚡ Sedikit tertinggal — tambah porsi baca ya."}
            </p>
            <p className="text-xs text-slate-400">
              {khatam.mulai} → {khatam.targetTanggal}
            </p>
            <button
              onClick={hapusKhatam}
              className="text-xs text-rose-600 hover:underline"
            >
              Hapus rencana
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Tetapkan target tanggal khatam (mulai hari ini). Kami hitung berapa
              ayat/hari yang perlu dibaca.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="text-slate-600">Target khatam</span>
                <input
                  type="date"
                  value={khatamTarget}
                  min={addDays(todayIso(), 1)}
                  onChange={(e) => setKhatamTarget(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <button
                onClick={saveKhatam}
                disabled={savingKhatam}
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {savingKhatam ? "…" : "Mulai rencana"}
              </button>
            </div>
            <div className="flex gap-2 text-xs">
              {[30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setKhatamTarget(addDays(todayIso(), d))}
                  className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50"
                >
                  {d} hari
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
