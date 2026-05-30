"use client";

import { Sparkles } from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface TahlilEntry {
  id: number;
  urutan: number;
  judul: string;
  arab: string;
  latin: string | null;
  arti: string;
  hitungan: number | null;
  jenis: string | null;
}

const JENIS_LABEL: Record<string, { label: string; color: string }> = {
  pembuka: { label: "Pembuka", color: "bg-amber-50 text-amber-700 border-amber-100" },
  surat: { label: "Surat & Ayat", color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  tasbih: { label: "Tasbih & Tahlil", color: "bg-indigo-50 text-indigo-700 border-indigo-100" },
  shalawat: { label: "Shalawat", color: "bg-rose-50 text-rose-700 border-rose-100" },
  doa: { label: "Doa", color: "bg-teal-50 text-teal-700 border-teal-100" },
  lain: { label: "Lainnya", color: "bg-slate-50 text-slate-700 border-slate-100" },
};

export default function TahlilPage() {
  const { data, error, isLoading } = useSWR<TahlilEntry[]>("/tahlil", fetcher);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <Sparkles size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Tahlil
          </h1>
        </div>
        <p className="text-slate-600 mt-2 leading-relaxed">
          Urutan lengkap bacaan tahlil, dari pengantar Al-Fatihah hingga doa
          penutup. Cocok untuk acara peringatan dan tahlilan bersama.
        </p>
      </header>

      {error && <ErrorBox message="Gagal memuat data" />}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}

      <ol className="space-y-3">
        {data?.map((t) => {
          const jenisInfo =
            (t.jenis && JENIS_LABEL[t.jenis]) || JENIS_LABEL.lain;
          return (
            <li key={t.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs shrink-0">
                    {t.urutan}
                  </span>
                  <h2 className="font-semibold text-slate-900 break-words">
                    {t.judul}
                  </h2>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-bold ${jenisInfo.color}`}
                >
                  {jenisInfo.label}
                </span>
              </div>
              {t.arab && (
                <p className="arabic text-xl sm:text-2xl leading-loose text-slate-900 text-right break-words">
                  {t.arab}
                </p>
              )}
              {t.latin && (
                <p className="text-sm italic text-slate-500">{t.latin}</p>
              )}
              <p className="text-slate-700 leading-relaxed text-sm">{t.arti}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
