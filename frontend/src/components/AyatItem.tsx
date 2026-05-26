"use client";

import type { Ayat } from "@/lib/types";

interface Props {
  ayat: Ayat;
  playing: boolean;
  onTogglePlay: () => void;
  tafsirText?: string;
  showTafsir: boolean;
  onToggleTafsir: () => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  memorized: boolean;
  onMemorize: () => void;
  loggedIn: boolean;
}

export function AyatItem({
  ayat,
  playing,
  onTogglePlay,
  tafsirText,
  showTafsir,
  onToggleTafsir,
  bookmarked,
  onToggleBookmark,
  memorized,
  onMemorize,
  loggedIn,
}: Props) {
  return (
    <div className="rounded-2xl border border-emerald-900/10 bg-white/60 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="grid h-8 min-w-8 place-items-center rounded-full bg-emerald-600/10 px-2 text-xs font-bold text-emerald-700">
          {ayat.surah?.nomor ?? ""}:{ayat.nomorAyat}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onTogglePlay}
            title="Putar audio"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-emerald-600/10 text-emerald-700"
          >
            {playing ? "⏸" : "▶"}
          </button>
          {loggedIn && (
            <button
              onClick={onToggleBookmark}
              title="Bookmark"
              className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-emerald-600/10 ${
                bookmarked ? "text-amber-500" : "text-emerald-700/60"
              }`}
            >
              {bookmarked ? "★" : "☆"}
            </button>
          )}
          {loggedIn && (
            <button
              onClick={onMemorize}
              disabled={memorized}
              title={memorized ? "Sudah ditandai hafal" : "Tandai untuk dihafal"}
              className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-emerald-600/10 ${
                memorized ? "text-emerald-600" : "text-emerald-700/60"
              }`}
            >
              {memorized ? "🧠" : "🧠"}
            </button>
          )}
          {tafsirText && (
            <button
              onClick={onToggleTafsir}
              title="Tafsir"
              className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-emerald-600/10 text-emerald-700/70 ${
                showTafsir ? "bg-emerald-600/10" : ""
              }`}
            >
              📖
            </button>
          )}
        </div>
      </div>

      <p className="arabic text-2xl sm:text-3xl text-right mb-4 text-emerald-950">
        {ayat.teksArab}
      </p>
      <p className="text-sm italic text-emerald-700/70 mb-2">{ayat.teksLatin}</p>
      <p className="text-[15px] leading-relaxed text-emerald-950/80">
        {ayat.teksIndonesia}
      </p>

      {showTafsir && tafsirText && (
        <div className="mt-4 rounded-xl bg-emerald-600/5 border border-emerald-600/15 p-3 text-sm leading-relaxed text-emerald-950/75">
          <span className="block text-xs font-semibold text-emerald-700 mb-1">
            Tafsir (Kemenag)
          </span>
          {tafsirText}
        </div>
      )}
    </div>
  );
}
