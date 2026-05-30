"use client";

import { Minus, Moon, Plus, RefreshCw, Sunrise } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface WiridItem {
  id: number;
  judul: string;
  arab: string;
  latin: string;
  terjemah: string;
  sumber: string | null;
  hitungan: number | null;
  urutan: number;
}

const TABS = [
  { key: "pagi", label: "Pagi", icon: Sunrise, color: "amber" },
  { key: "petang", label: "Petang", icon: Moon, color: "indigo" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const COUNTER_KEY = "rumahquran:wiridCounters";

function autoTab(): TabKey {
  const h = new Date().getHours();
  return h >= 4 && h < 14 ? "pagi" : "petang";
}

export default function WiridPage() {
  const [active, setActive] = useState<TabKey>("pagi");
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setActive(autoTab());
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(COUNTER_KEY);
        if (raw) setCounters(JSON.parse(raw) as Record<string, number>);
      } catch {
        /* ignore */
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
  }, [counters, hydrated]);

  const { data, error, isLoading } = useSWR<WiridItem[]>(
    `/wirid/${active}`,
    fetcher,
  );

  const tabMeta = useMemo(() => TABS.find((t) => t.key === active)!, [active]);

  function bumpCounter(id: number, delta: number) {
    setCounters((c) => ({
      ...c,
      [`${active}-${id}`]: Math.max(0, (c[`${active}-${id}`] ?? 0) + delta),
    }));
  }

  function resetAll() {
    setCounters((c) => {
      const next = { ...c };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${active}-`)) delete next[k];
      }
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Wirid Pagi &amp; Petang
          </h1>
          <p className="text-slate-600 mt-1">
            Dzikir harian dari Al-Qur&apos;an dan Sunnah. Counter di-simpan di
            perangkat ini.
          </p>
        </div>
      </header>

      <div className="flex gap-2 bg-slate-100 rounded-xl p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? "bg-white shadow text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <p>
          Tab dipilih otomatis: {autoTab() === "pagi" ? "pagi (04-14)" : "petang (14-04)"}.
        </p>
        <button
          onClick={resetAll}
          className="inline-flex items-center gap-1 hover:text-emerald-700"
        >
          <RefreshCw size={12} /> Reset {tabMeta.label}
        </button>
      </div>

      {error && <ErrorBox message="Gagal memuat wirid" />}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      )}

      <ul className="space-y-4">
        {data?.map((w, i) => {
          const key = `${active}-${w.id}`;
          const count = counters[key] ?? 0;
          const target = w.hitungan ?? 1;
          const pct = target > 0 ? Math.min(100, (count / target) * 100) : 0;
          const done = target > 0 && count >= target;
          return (
            <li
              key={w.id}
              className={`card p-5 space-y-3 transition ${done ? "ring-2 ring-emerald-400" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    #{i + 1} · {tabMeta.label}
                  </p>
                  <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                    {w.judul}
                  </h2>
                </div>
                {target > 1 && (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                    × {target}
                  </span>
                )}
              </div>
              <p className="arabic text-xl sm:text-2xl leading-loose text-slate-900 text-right break-words">
                {w.arab}
              </p>
              <p className="text-sm italic text-slate-600">{w.latin}</p>
              <p className="text-slate-700 leading-relaxed">{w.terjemah}</p>
              {w.sumber && (
                <p className="text-xs text-slate-400 italic">— {w.sumber}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => bumpCounter(w.id, -1)}
                  disabled={count === 0}
                  aria-label="Kurangi hitungan"
                  className="h-9 w-9 grid place-items-center rounded-full bg-slate-100 text-slate-700 disabled:opacity-40 hover:bg-slate-200"
                >
                  <Minus size={14} />
                </button>
                <button
                  onClick={() => bumpCounter(w.id, 1)}
                  className="flex-1 inline-flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium"
                >
                  <span>
                    {count} / {target}
                  </span>
                  <Plus size={14} />
                </button>
              </div>
              {target > 1 && (
                <div className="h-1 rounded-full overflow-hidden bg-slate-100">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
