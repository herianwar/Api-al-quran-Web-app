"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { Doa } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

const ALL_GROUP = "Semua";

export default function DoaPage() {
  const { data, error, isLoading } = useSWR<Doa[]>("/doa?limit=300", fetcher);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string>(ALL_GROUP);

  const groups = useMemo(() => {
    if (!data) return [ALL_GROUP];
    const set = new Set<string>();
    for (const d of data) {
      if (d.grup) set.add(d.grup);
    }
    return [ALL_GROUP, ...Array.from(set).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter((d) => {
      if (activeGroup !== ALL_GROUP && d.grup !== activeGroup) return false;
      if (!q) return true;
      return (
        d.judul.toLowerCase().includes(q) ||
        d.terjemah.toLowerCase().includes(q) ||
        (d.tag?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [data, query, activeGroup]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
        Doa &amp; Dzikir
      </h1>
      <p className="text-slate-600 mb-6 leading-relaxed">
        Kumpulan doa harian dari berbagai situasi — tidur, makan, perjalanan,
        kesedihan, dan lainnya. Lengkap teks Arab, latin, terjemah & sumber.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari judul / terjemahan / tag…"
        className="w-full mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
      />

      {groups.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1 scrollbar-thin">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                activeGroup === g
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {data && (
        <p className="text-xs text-slate-500 mb-4 tabular-nums">
          {filtered.length.toLocaleString("id-ID")} dari{" "}
          {data.length.toLocaleString("id-ID")} doa
          {activeGroup !== ALL_GROUP && (
            <>
              {" "}
              <span className="font-semibold text-slate-700">
                · {activeGroup}
              </span>
            </>
          )}
        </p>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <Skeleton width="45%" height={18} />
              <Skeleton width="100%" height={28} />
              <Skeleton width="80%" height={14} />
              <Skeleton width="95%" height={14} />
            </div>
          ))}
        </div>
      )}
      {error && <ErrorBox message={error.message} />}

      <div className="space-y-3">
        {filtered.map((d) => (
          <article key={d.id} className="card p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="font-bold text-slate-900 text-lg">{d.judul}</h2>
              {d.grup && (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  {d.grup}
                </span>
              )}
            </div>
            <p className="arabic arabic-body text-right text-slate-900 mb-3">
              {d.arab}
            </p>
            {d.latin && (
              <p className="text-sm italic text-slate-500 mb-2.5">{d.latin}</p>
            )}
            <p className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
              {d.terjemah}
            </p>
            {d.tag && (
              <div className="flex gap-1.5 flex-wrap mt-3">
                {d.tag.split(/,\s*/).filter(Boolean).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
            {d.sumber && (
              <p className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 whitespace-pre-wrap leading-relaxed">
                <span className="font-semibold">Sumber:</span> {d.sumber}
              </p>
            )}
          </article>
        ))}
        {!isLoading && !error && filtered.length === 0 && (
          <p className="text-sm text-slate-500 py-12 text-center">
            Tidak ada doa yang cocok. Coba ganti kata kunci atau kategori.
          </p>
        )}
      </div>
    </div>
  );
}
