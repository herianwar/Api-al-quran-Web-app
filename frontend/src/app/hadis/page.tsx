"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { Perawi } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { CardRowSkeleton } from "@/components/Skeleton";

const PERAWI_META: Record<
  string,
  { tone: string; description: string }
> = {
  bukhari: {
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "Imam Muhammad bin Ismail al-Bukhari (194–256 H)",
  },
  muslim: {
    tone: "bg-sky-50 text-sky-700 border-sky-200",
    description: "Imam Muslim bin al-Hajjaj (204–261 H)",
  },
  "abu-dawud": {
    tone: "bg-amber-50 text-amber-700 border-amber-200",
    description: "Imam Abu Dawud as-Sijistani (202–275 H)",
  },
  tirmidzi: {
    tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
    description: "Imam at-Tirmidzi (209–279 H)",
  },
  nasai: {
    tone: "bg-rose-50 text-rose-700 border-rose-200",
    description: "Imam an-Nasai (215–303 H)",
  },
  "ibnu-majah": {
    tone: "bg-purple-50 text-purple-700 border-purple-200",
    description: "Imam Ibnu Majah (209–273 H)",
  },
  ahmad: {
    tone: "bg-teal-50 text-teal-700 border-teal-200",
    description: "Imam Ahmad bin Hanbal (164–241 H)",
  },
  malik: {
    tone: "bg-cyan-50 text-cyan-700 border-cyan-200",
    description: "Imam Malik bin Anas (93–179 H) — Al-Muwatta",
  },
  darimi: {
    tone: "bg-slate-50 text-slate-700 border-slate-200",
    description: "Imam Abdullah ad-Darimi (181–255 H)",
  },
};

export default function HadisIndexPage() {
  const { data, error, isLoading } = useSWR<Perawi[]>(
    "/hadith/perawi",
    fetcher,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
        Hadis Sembilan Perawi
      </h1>
      <p className="text-slate-600 mb-6 leading-relaxed">
        Kumpulan hadis dari 9 kitab utama dengan terjemahan Indonesia. Pilih
        perawi untuk mulai membaca.
      </p>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardRowSkeleton key={i} />
          ))}
        </div>
      )}
      {error && <ErrorBox message={error.message} />}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map((p) => {
            const meta =
              PERAWI_META[p.slug] ?? {
                tone: "bg-slate-50 text-slate-700 border-slate-200",
                description: "",
              };
            return (
              <Link
                key={p.slug}
                href={`/hadis/${p.slug}`}
                className="card p-5 hover:shadow-md hover:border-emerald-300 transition group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-bold text-slate-900 text-lg group-hover:text-emerald-700 transition">
                    HR. {p.nama}
                  </h2>
                  <span
                    className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${meta.tone}`}
                  >
                    {p.total.toLocaleString("id-ID")} hadis
                  </span>
                </div>
                {meta.description && (
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {meta.description}
                  </p>
                )}
                <p className="text-xs text-emerald-700 font-semibold mt-3 group-hover:underline">
                  Buka koleksi →
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
