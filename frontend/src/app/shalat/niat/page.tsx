"use client";

import { Sunrise } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface Niat {
  id: number;
  slug: string;
  nama: string;
  arab: string;
  latin: string;
  arti: string;
  urutan: number;
}

export default function NiatShalatPage() {
  const { data, error, isLoading } = useSWR<Niat[]>("/niat-shalat", fetcher);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <Sunrise size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Niat Shalat Fardhu
          </h1>
        </div>
        <p className="text-slate-600 mt-2 leading-relaxed">
          5 niat shalat wajib lengkap dengan teks Arab, latin, dan arti.
        </p>
      </header>

      {error && <ErrorBox message="Gagal memuat data" />}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      )}

      <ul className="space-y-4">
        {data?.map((n) => (
          <li
            key={n.id}
            id={n.slug}
            className="card p-5 scroll-mt-24 space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                {n.urutan}
              </span>
              <h2 className="font-semibold text-slate-900">{n.nama}</h2>
            </div>
            <p className="arabic text-xl sm:text-2xl leading-loose text-slate-900 text-right break-words">
              {n.arab}
            </p>
            <p className="text-sm italic text-slate-600">{n.latin}</p>
            <p className="text-slate-700 leading-relaxed">{n.arti}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
