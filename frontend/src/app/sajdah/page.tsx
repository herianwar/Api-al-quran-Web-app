"use client";

import { BookMarked, ChevronRight } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface AyatSajdah {
  id: number;
  nomorAyat: number;
  teksArab: string;
  teksIndonesia: string;
  sajdah: "wajibah" | "mukhtalaf" | string;
  surah: { nomor: number; namaLatin: string };
}

const JENIS_LABEL: Record<string, { label: string; color: string; desc: string }> = {
  wajibah: {
    label: "Wajibah",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    desc: "Disepakati jumhur ulama sebagai ayat sajdah tilawah.",
  },
  mukhtalaf: {
    label: "Mukhtalaf",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    desc: "Sebagian ulama menetapkan, sebagian tidak.",
  },
};

export default function SajdahPage() {
  const { data, error, isLoading } = useSWR<AyatSajdah[]>(
    "/quran/sajdah",
    fetcher,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <BookMarked size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Ayat Sajdah
          </h1>
        </div>
        <p className="text-slate-600 mt-2 leading-relaxed">
          15 ayat di seluruh Al-Qur&apos;an yang dianjurkan sujud tilawah ketika
          dibaca atau didengar.
        </p>
      </header>

      {/* Legenda */}
      <div className="grid sm:grid-cols-2 gap-2">
        {Object.entries(JENIS_LABEL).map(([k, v]) => (
          <div
            key={k}
            className="card p-3 flex items-start gap-2 text-xs"
          >
            <span
              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-bold shrink-0 ${v.color}`}
            >
              {v.label}
            </span>
            <p className="text-slate-600 leading-relaxed">{v.desc}</p>
          </div>
        ))}
      </div>

      {error && <ErrorBox message="Gagal memuat data" />}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      )}

      <ol className="space-y-3">
        {data?.map((a, idx) => {
          const info = JENIS_LABEL[a.sajdah] ?? JENIS_LABEL.wajibah;
          return (
            <li key={a.id} className="card p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 font-bold text-xs shrink-0">
                    {idx + 1}
                  </span>
                  <Link
                    href={`/surat/${a.surah.nomor}#ayat-${a.nomorAyat}`}
                    className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold"
                  >
                    Q.S. {a.surah.namaLatin} {a.surah.nomor}:{a.nomorAyat}
                    <ChevronRight size={14} />
                  </Link>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-bold ${info.color}`}
                >
                  {info.label}
                </span>
              </div>
              <p className="arabic text-xl sm:text-2xl leading-loose text-slate-900 text-right break-words">
                {a.teksArab}
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {a.teksIndonesia}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
