"use client";

import { BookOpen } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface Bacaan {
  varian: number;
  arab: string;
  latin: string;
  arti: string;
}

interface GerakanGroup {
  gerakan: number;
  nama: string;
  bacaan: Bacaan[];
}

export default function BacaanShalatPage() {
  const { data, error, isLoading } = useSWR<GerakanGroup[]>(
    "/bacaan-shalat",
    fetcher,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <BookOpen size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Bacaan Shalat
          </h1>
        </div>
        <p className="text-slate-600 mt-2 leading-relaxed">
          Tata cara shalat: setiap gerakan dengan bacaannya, dari Takbiratul
          Ihram sampai Salam.
        </p>
      </header>

      {error && <ErrorBox message="Gagal memuat data" />}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      )}

      <ol className="space-y-5">
        {data?.map((g) => (
          <li key={g.gerakan} className="card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
                {g.gerakan}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-900">{g.nama}</h2>
                {g.bacaan.length > 1 && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {g.bacaan.length} bacaan alternatif
                  </p>
                )}
              </div>
            </div>
            <ul className="space-y-4">
              {g.bacaan.map((b) => (
                <li
                  key={b.varian}
                  className={
                    g.bacaan.length > 1
                      ? "border-l-2 border-emerald-100 pl-4"
                      : ""
                  }
                >
                  {g.bacaan.length > 1 && (
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                      Bacaan {b.varian}
                    </p>
                  )}
                  <p className="arabic text-xl sm:text-2xl leading-loose text-slate-900 text-right break-words">
                    {b.arab}
                  </p>
                  {b.latin && (
                    <p className="text-sm italic text-slate-500 mt-2">
                      {b.latin}
                    </p>
                  )}
                  {b.arti && (
                    <p className="text-slate-700 leading-relaxed mt-1.5">
                      {b.arti}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
