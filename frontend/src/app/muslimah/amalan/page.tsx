"use client";

import { ArrowLeft, Check, Flame, ListChecks } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AmalanHari, AmalanItem, AmalanStats } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

export default function AmalanPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const { data: hari, mutate } = useSWR<AmalanHari>(
    user ? "/muslimah/amalan" : null,
    fetcher,
  );
  const { data: stats, mutate: mutateStats } = useSWR<AmalanStats>(
    user ? "/muslimah/amalan/stats" : null,
    fetcher,
  );

  if (loading || !user) return <Spinner label="Memuat…" />;

  async function toggle(item: AmalanItem) {
    // Optimistic update
    await mutate(
      (prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) =>
                i.key === item.key ? { ...i, done: !i.done } : i,
              ),
            }
          : prev,
      { revalidate: false },
    );
    await apiFetch("/muslimah/amalan/toggle", {
      method: "POST",
      body: JSON.stringify({ key: item.key, done: !item.done }),
    }).catch(() => undefined);
    await Promise.all([mutate(), mutateStats()]);
  }

  // Group items by `grup`
  const groups = (hari?.items ?? []).reduce<Record<string, AmalanItem[]>>(
    (acc, it) => {
      (acc[it.grup] ??= []).push(it);
      return acc;
    },
    {},
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/muslimah"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-600"
        >
          <ArrowLeft size={15} /> Muslimah
        </Link>
      </div>

      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-violet-100 text-violet-600 grid place-items-center">
          <ListChecks size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Amalan Harian</h1>
          <p className="text-sm text-slate-500">
            Ceklis ibadah harianmu — istiqamah dari hal kecil.
          </p>
        </div>
      </header>

      {/* Ringkasan hari ini + streak */}
      <section className="grid grid-cols-2 gap-3">
        <div className="card p-5">
          <p className="text-xs text-slate-500">Hari ini</p>
          <p className="text-3xl font-bold text-slate-900">
            {hari?.selesai ?? 0}
            <span className="text-base font-medium text-slate-400">
              /{hari?.total ?? 0}
            </span>
          </p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all"
              style={{ width: `${hari?.persen ?? 0}%` }}
            />
          </div>
        </div>
        <div className="card p-5 flex flex-col justify-center">
          <p className="text-xs text-slate-500">Streak</p>
          <p className="text-3xl font-bold text-amber-600 inline-flex items-center gap-1.5">
            <Flame size={24} className="fill-amber-400 text-amber-500" />
            {stats?.current ?? 0}
            <span className="text-base font-medium text-slate-400">hari</span>
          </p>
        </div>
      </section>

      {/* Ceklis */}
      {!hari ? (
        <Spinner label="Memuat amalan…" />
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([grup, items]) => (
            <section key={grup}>
              <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {grup}
              </p>
              <div className="space-y-2">
                {items.map((it) => (
                  <button
                    key={it.key}
                    onClick={() => toggle(it)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      it.done
                        ? "border-violet-300 bg-violet-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full border-2 shrink-0 transition ${
                        it.done
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-slate-300 text-transparent"
                      }`}
                    >
                      <Check size={14} strokeWidth={3} />
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        it.done ? "text-violet-900" : "text-slate-700"
                      }`}
                    >
                      {it.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Riwayat 14 hari */}
      {stats && stats.last14.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">14 hari terakhir</h2>
          <div className="flex items-end gap-1.5 h-20">
            {stats.last14.map((d) => {
              const h = Math.round((d.count / stats.total) * 100);
              return (
                <div
                  key={d.tanggal}
                  className="flex-1 flex flex-col justify-end items-center gap-1"
                  title={`${d.tanggal}: ${d.count}/${stats.total}`}
                >
                  <div
                    className="w-full rounded-t bg-violet-400"
                    style={{ height: `${Math.max(4, h)}%` }}
                  />
                  <span className="text-[9px] text-slate-400">
                    {d.tanggal.slice(8, 10)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
