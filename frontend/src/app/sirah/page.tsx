"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface SirahListItem {
  id: number;
  slug: string;
  judul: string;
  urutan: number;
  periode: string | null;
}

export default function SirahListPage() {
  const { data, error, isLoading } = useSWR<SirahListItem[]>(
    "/sirah",
    fetcher,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <BookOpen size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Sirah Nabawi
          </h1>
        </div>
        <p className="text-slate-600 mt-2">
          Perjalanan hidup Nabi Muhammad ﷺ dari kelahiran hingga wafatnya —
          tersusun kronologis untuk memudahkan pembacaan.
        </p>
      </header>

      {error && <ErrorBox message="Gagal memuat sirah" />}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      )}

      <ol className="space-y-3">
        {data?.map((s) => (
          <li key={s.id}>
            <Link
              href={`/sirah/${s.slug}`}
              className="card card-hover flex items-start gap-4 p-5 group"
            >
              <span className="h-10 w-10 grid place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold shrink-0">
                {s.urutan}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-900 group-hover:text-emerald-700">
                  {s.judul}
                </h2>
                {s.periode && (
                  <p className="text-xs text-slate-500 mt-0.5">{s.periode}</p>
                )}
              </div>
              <span className="text-emerald-700 self-center">→</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
