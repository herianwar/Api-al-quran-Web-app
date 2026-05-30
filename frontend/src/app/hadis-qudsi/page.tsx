"use client";

import { Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface HadisQudsi {
  id: number;
  nomor: number;
  judul: string | null;
  arab: string;
  terjemahan: string;
  sumber: string | null;
  kitab: string | null;
}

export default function HadisQudsiPage() {
  const { data, error, isLoading } = useSWR<HadisQudsi[]>(
    "/hadis-qudsi?limit=200",
    fetcher,
  );
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (h) =>
        (h.judul ?? "").toLowerCase().includes(q) ||
        h.terjemahan.toLowerCase().includes(q) ||
        h.arab.includes(query),
    );
  }, [data, query]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <Sparkles size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Hadis Qudsi
          </h1>
        </div>
        <p className="text-slate-600 mt-2 leading-relaxed">
          Kumpulan hadis qudsi — wahyu langsung dari Allah ﷻ yang disampaikan
          melalui lisan Rasulullah ﷺ. Berbeda dari Al-Qur&apos;an karena bukan
          mukjizat lafaz, namun maknanya berasal dari Allah.
        </p>
      </header>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={18}
        />
        <input
          type="search"
          placeholder="Cari berdasar judul atau terjemahan…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {error && <ErrorBox message="Gagal memuat hadis qudsi" />}

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      )}

      <ul className="space-y-4">
        {filtered.map((h) => (
          <li
            key={h.id}
            className="card p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Hadis Qudsi #{h.nomor}
                </p>
                {h.judul && (
                  <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                    {h.judul}
                  </h2>
                )}
              </div>
              {h.sumber && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap">
                  {h.sumber}
                </span>
              )}
            </div>
            <p className="arabic text-xl sm:text-2xl leading-loose text-slate-900 text-right break-words">
              {h.arab}
            </p>
            <p className="text-slate-700 leading-relaxed">{h.terjemahan}</p>
            {h.kitab && (
              <p className="text-xs text-slate-400 italic">— {h.kitab}</p>
            )}
          </li>
        ))}
      </ul>

      {!isLoading && filtered.length === 0 && (
        <p className="text-center text-slate-500 py-8">
          Tidak ada hadis qudsi yang cocok.
        </p>
      )}
    </div>
  );
}
