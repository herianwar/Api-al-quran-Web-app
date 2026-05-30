"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";

interface TopicSummary {
  slug: string;
  nama: string;
  deskripsi: string | null;
  aiSummary: string | null;
  jumlahAyat: number;
  curatedCount: number;
  aiCount: number;
}

export default function TopicListPage() {
  const { data, error, isLoading } = useSWR<TopicSummary[]>("/topic", fetcher);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter(
      (t) =>
        t.nama.toLowerCase().includes(term) ||
        t.slug.toLowerCase().includes(term) ||
        (t.deskripsi ?? "").toLowerCase().includes(term) ||
        (t.aiSummary ?? "").toLowerCase().includes(term),
    );
  }, [data, q]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
        Browse Tematik
      </h1>
      <p className="text-slate-600 mb-6 leading-relaxed">
        Jelajahi ayat-ayat Al-Qur&apos;an berdasarkan tema. Tiap topik dilengkapi
        kurasi ulama + ayat tambahan hasil AI semantic similarity.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari tema (sabar, rezeki, dll)…"
        className="w-full mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
      />

      {isLoading && <Spinner label="Memuat tema…" />}
      {error && <ErrorBox message={error.message} />}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <Link
              key={t.slug}
              href={`/topic/${t.slug}`}
              className="card card-hover p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-bold text-slate-900 text-base">{t.nama}</h2>
                <div className="shrink-0 flex items-center gap-1 text-[10px] font-bold">
                  <span
                    className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded"
                    title="Ayat kurasi ulama"
                  >
                    {t.curatedCount}
                  </span>
                  {t.aiCount > 0 && (
                    <span
                      className="text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"
                      title="Ayat tambahan AI"
                    >
                      <Sparkles size={9} /> {t.aiCount}
                    </span>
                  )}
                </div>
              </div>
              {t.aiSummary ? (
                <p className="text-sm leading-relaxed text-slate-700 line-clamp-3 italic">
                  &ldquo;{t.aiSummary}&rdquo;
                </p>
              ) : (
                t.deskripsi && (
                  <p className="text-sm leading-relaxed text-slate-600 line-clamp-3">
                    {t.deskripsi}
                  </p>
                )
              )}
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-sm text-slate-500 py-12 text-center">
              Tidak ada tema cocok. Coba kata lain.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
