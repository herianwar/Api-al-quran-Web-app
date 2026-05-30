"use client";

import { Search, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface NabiListItem {
  id: number;
  urutan: number;
  slug: string;
  nama: string;
  namaArab: string;
  gelar: string | null;
  periode: string | null;
  ringkasan: string;
}

export default function NabiListPage() {
  const { data, error, isLoading } = useSWR<NabiListItem[]>("/nabi", fetcher);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (n) =>
        n.nama.toLowerCase().includes(q) ||
        (n.gelar ?? "").toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <Users size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Kisah 25 Nabi
          </h1>
        </div>
        <p className="text-slate-600 mt-2">
          Biografi singkat & narasi lengkap 25 nabi yang wajib diketahui umat
          Islam, dari Adam hingga Muhammad ﷺ.
        </p>
      </header>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={18}
        />
        <input
          type="search"
          placeholder="Cari nama nabi atau gelar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {error && <ErrorBox message="Gagal memuat data nabi" />}
      {isLoading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((n) => (
          <Link
            key={n.id}
            href={`/nabi/${n.slug}`}
            className="card card-hover p-5 group"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="chip chip-gold text-xs">No. {n.urutan}</span>
              <span className="arabic text-2xl text-emerald-800">
                {n.namaArab}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700">
              {n.nama}
            </h2>
            {n.gelar && (
              <p className="text-xs text-amber-700 mt-0.5">{n.gelar}</p>
            )}
            {n.periode && (
              <p className="text-xs text-slate-400 mt-1">{n.periode}</p>
            )}
            <p className="text-sm text-slate-600 mt-3 leading-relaxed line-clamp-3">
              {n.ringkasan}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
