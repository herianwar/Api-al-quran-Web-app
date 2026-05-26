import Link from "next/link";
import type { SurahListItem } from "@/lib/types";

export function SurahCard({ surah }: { surah: SurahListItem }) {
  return (
    <Link
      href={`/surat/${surah.nomor}`}
      className="group flex items-center gap-3 rounded-xl border border-emerald-900/10 bg-white/60 p-3 hover:border-emerald-500 hover:shadow-sm transition"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-600/10 text-sm font-bold text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
        {surah.nomor}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold truncate">{surah.namaLatin}</span>
        <span className="block text-xs text-emerald-900/60 truncate">
          {surah.arti} · {surah.jumlahAyat} ayat · {surah.tempatTurun}
        </span>
      </span>
      <span className="arabic text-lg text-emerald-700 shrink-0">{surah.nama}</span>
    </Link>
  );
}
