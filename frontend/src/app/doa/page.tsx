"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { Doa } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";

export default function DoaPage() {
  const { data, error, isLoading } = useSWR<Doa[]>("/doa", fetcher);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (d) =>
        d.judul.toLowerCase().includes(q) ||
        d.terjemah.toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Doa &amp; Dzikir</h1>
      <p className="text-emerald-900/60 text-sm mb-5">
        Kumpulan doa harian lengkap dengan teks Arab, latin, dan terjemah.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari doa…"
        className="w-full mb-5 rounded-xl border border-emerald-900/15 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
      />

      {isLoading && <Spinner label="Memuat doa…" />}
      {error && <ErrorBox message={error.message} />}

      <div className="space-y-3">
        {filtered.map((d) => (
          <article
            key={d.id}
            className="rounded-2xl border border-emerald-900/10 bg-white/60 p-4 sm:p-5"
          >
            <h2 className="font-semibold text-emerald-800 mb-3">{d.judul}</h2>
            <p className="arabic text-2xl text-right mb-3">{d.arab}</p>
            {d.latin && (
              <p className="text-sm italic text-emerald-700/70 mb-2">
                {d.latin}
              </p>
            )}
            <p className="text-[15px] leading-relaxed text-emerald-950/80">
              {d.terjemah}
            </p>
            {d.sumber && (
              <p className="mt-2 text-xs text-emerald-900/50">— {d.sumber}</p>
            )}
          </article>
        ))}
        {!isLoading && !error && filtered.length === 0 && (
          <p className="text-sm text-emerald-900/50 py-8 text-center">
            Tidak ada doa. Pastikan data sudah di-seed di backend.
          </p>
        )}
      </div>
    </div>
  );
}
