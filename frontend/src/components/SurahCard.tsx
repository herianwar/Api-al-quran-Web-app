import Link from "next/link";
import type { SurahListItem } from "@/lib/types";

export function SurahCard({ surah }: { surah: SurahListItem }) {
  return (
    <Link
      href={`/surat/${surah.nomor}`}
      className="card card-hover group flex items-center gap-3.5 p-3.5"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
        {surah.nomor}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900 truncate">
          {surah.namaLatin}
        </span>
        <span className="block text-xs text-slate-500 truncate mt-0.5">
          {surah.arti} · {surah.jumlahAyat} ayat · {surah.tempatTurun}
        </span>
      </span>
      <span className="arabic text-2xl text-emerald-700 shrink-0">
        {surah.nama}
      </span>
    </Link>
  );
}
