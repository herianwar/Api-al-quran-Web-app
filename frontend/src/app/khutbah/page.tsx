"use client";

import { BookOpen, Filter, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface KhutbahListItem {
  id: number;
  slug: string;
  judul: string;
  tema: string | null;
  tanggal: string | null;
  sumber: string | null;
}

interface TemaItem {
  tema: string;
  total: number;
}

export default function KhutbahListPage() {
  const [query, setQuery] = useState("");
  const [tema, setTema] = useState<string | null>(null);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (tema) params.set("tema", tema);
    if (query.trim().length >= 2) params.set("q", query.trim());
    return `/khutbah?${params.toString()}`;
  }, [tema, query]);

  const { data, error, isLoading } = useSWR<KhutbahListItem[]>(url, fetcher);
  const { data: temas } = useSWR<TemaItem[]>("/khutbah/tema", fetcher);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <BookOpen size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Khutbah Jumat
          </h1>
        </div>
        <p className="text-slate-600 mt-2">
          Arsip khutbah jumat singkat — referensi bagi khatib, materi belajar,
          atau renungan akhir pekan.
        </p>
      </header>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={18}
        />
        <input
          type="search"
          placeholder="Cari judul khutbah…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {temas && temas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <button
            onClick={() => setTema(null)}
            className={`text-xs px-3 py-1.5 rounded-full ${
              !tema
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Semua
          </button>
          {temas.map((t) => (
            <button
              key={t.tema}
              onClick={() => setTema(t.tema)}
              className={`text-xs px-3 py-1.5 rounded-full capitalize ${
                tema === t.tema
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.tema} <span className="opacity-60">({t.total})</span>
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBox message="Gagal memuat khutbah" />}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}

      <ul className="space-y-3">
        {data?.map((k) => (
          <li key={k.id}>
            <Link
              href={`/khutbah/${k.slug}`}
              className="card card-hover block p-5 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900 group-hover:text-emerald-700">
                    {k.judul}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    {k.tema && (
                      <span className="capitalize px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {k.tema}
                      </span>
                    )}
                    {k.sumber && <span>· {k.sumber}</span>}
                  </p>
                </div>
                <span className="text-emerald-700 text-sm">→</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {!isLoading && data && data.length === 0 && (
        <p className="text-center text-slate-500 py-8">Tidak ada khutbah yang cocok.</p>
      )}
    </div>
  );
}
