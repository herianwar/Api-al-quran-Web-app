"use client";

import { useState } from "react";
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
  extraTranslation?: string;
  asbabText?: string;
  showAsbab?: boolean;
  onToggleAsbab?: () => void;
  /** Render kata-perkata (word-by-word) under the Arab line. Only shown
   * when this prop is non-empty AND showKata is true. */
  kata?: { posisi: number; arab: string; transliterasi: string | null; arti: string }[];
  showKata?: boolean;
  onToggleKata?: () => void;
  /** Personal notes shown inline + a button to add a new one. */
  notes?: { id: string; judul: string | null; body: string }[];
  onAddNote?: () => void;
  onDeleteNote?: (id: string) => void;
  /** Reader display preferences (set from the surah page toolbar). */
  showLatin?: boolean;
  showTranslation?: boolean;
}

function IconButton({
  active,
  title,
  onClick,
  disabled,
  children,
  variant = "default",
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "amber";
}) {
  const base =
    "grid h-9 w-9 place-items-center rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed";
  const colors =
    variant === "amber"
      ? active
        ? "bg-amber-100 text-amber-700"
        : "text-slate-500 hover:bg-amber-50 hover:text-amber-700"
      : active
        ? "bg-emerald-100 text-emerald-700"
        : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`${base} ${colors}`}
    >
      {children}
    </button>
  );
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
  extraTranslation,
  asbabText,
  showAsbab,
  onToggleAsbab,
  kata,
  showKata,
  onToggleKata,
  notes,
  onAddNote,
  onDeleteNote,
  showLatin = true,
  showTranslation = true,
}: Props) {
  const [copied, setCopied] = useState(false);

  const surahNomor = ayat.surah?.nomor;
  const ayatRef =
    ayat.surah?.namaLatin && surahNomor
      ? `QS. ${ayat.surah.namaLatin}: ${ayat.nomorAyat}`
      : `Ayat ${ayat.nomorAyat}`;

  async function copyAyat() {
    const text = [
      ayat.teksArab,
      ayat.teksIndonesia,
      `(${ayatRef})`,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  async function shareAyat() {
    const url =
      typeof window !== "undefined" && surahNomor
        ? `${window.location.origin}/surat/${surahNomor}#ayat-${ayat.nomorAyat}`
        : undefined;
    const shareText = `${ayat.teksIndonesia}\n\n— ${ayatRef}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: ayatRef, text: shareText, url });
      } catch {
        /* user dismissed the share sheet — ignore */
      }
      return;
    }
    // No Web Share API (most desktops): fall back to copying the link.
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <article
      id={`ayat-${ayat.nomorAyat}`}
      className={`card p-5 sm:p-6 scroll-mt-28 transition-shadow ${
        playing ? "ayat-playing" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-emerald-600 text-white px-2.5 text-sm font-bold shadow-sm">
          {ayat.nomorAyat}
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            active={playing}
            onClick={onTogglePlay}
            title={playing ? "Jeda audio" : "Putar audio"}
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </IconButton>
          {loggedIn && (
            <IconButton
              active={bookmarked}
              onClick={onToggleBookmark}
              title={bookmarked ? "Hapus bookmark" : "Tambah bookmark"}
              variant="amber"
            >
              {bookmarked ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4a2 2 0 0 0-2 2v14l8-4 8 4V6a2 2 0 0 0-2-2H6z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4a2 2 0 0 0-2 2v14l8-4 8 4V6a2 2 0 0 0-2-2H6z" />
                </svg>
              )}
            </IconButton>
          )}
          {loggedIn && (
            <IconButton
              active={memorized}
              onClick={onMemorize}
              disabled={memorized}
              title={memorized ? "Sudah ditandai hafal" : "Tandai untuk dihafal"}
            >
              {memorized ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a4 4 0 0 0-4 4v2H7a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-8a3 3 0 0 0-3-3h-1V6a4 4 0 0 0-4-4z" />
                </svg>
              )}
            </IconButton>
          )}
          {tafsirText && (
            <IconButton
              active={showTafsir}
              onClick={onToggleTafsir}
              title="Tafsir"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </IconButton>
          )}
          {asbabText && onToggleAsbab && (
            <IconButton
              active={showAsbab}
              onClick={onToggleAsbab}
              title="Asbabun Nuzul"
              variant="amber"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="15" y2="17" />
              </svg>
            </IconButton>
          )}
          {kata && kata.length > 0 && onToggleKata && (
            <IconButton
              active={!!showKata}
              onClick={onToggleKata}
              title="Tampilkan kata per kata"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </IconButton>
          )}
          {loggedIn && onAddNote && (
            <IconButton
              active={(notes ?? []).length > 0}
              onClick={onAddNote}
              title={(notes ?? []).length > 0 ? "Catatan ayat" : "Tambah catatan"}
              variant="amber"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </IconButton>
          )}
          <IconButton
            active={copied}
            onClick={() => void copyAyat()}
            title={copied ? "Tersalin!" : "Salin ayat"}
          >
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </IconButton>
          <IconButton
            onClick={() => void shareAyat()}
            title="Bagikan ayat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </IconButton>
        </div>
      </div>

      <p className="arabic arabic-body text-right text-slate-900 mb-5">
        {ayat.teksArab}
      </p>
      {showLatin && (
        <p className="text-sm text-slate-500 italic mb-2.5">{ayat.teksLatin}</p>
      )}
      {showTranslation && (
        <p className="text-[15.5px] leading-relaxed text-slate-800">
          {ayat.teksIndonesia}
        </p>
      )}

      {extraTranslation && (
        <p className="mt-3 pl-3.5 border-l-2 border-emerald-300 text-[15px] leading-relaxed text-slate-600 italic">
          {extraTranslation}
        </p>
      )}

      {showTafsir && tafsirText && (
        <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-[14.5px] leading-relaxed text-slate-800">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">
            Tafsir
          </p>
          {tafsirText}
        </div>
      )}

      {showAsbab && asbabText && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-[14.5px] leading-relaxed text-slate-800">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">
            Asbabun Nuzul
          </p>
          {asbabText}
        </div>
      )}

      {showKata && kata && kata.length > 0 && (
        <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
            Kata per kata
          </p>
          <div className="flex flex-wrap-reverse gap-3 justify-end">
            {kata.map((k) => (
              <div key={k.posisi} className="text-center min-w-16">
                <p className="arabic text-2xl text-slate-900 leading-tight">
                  {k.arab}
                </p>
                {k.transliterasi && (
                  <p className="text-[11px] italic text-slate-500 mt-0.5">
                    {k.transliterasi}
                  </p>
                )}
                <p className="text-xs text-emerald-700 mt-0.5">{k.arti}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50/60 border border-amber-100 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">
            Catatan saya ({notes.length})
          </p>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-lg bg-white border border-amber-100 p-3 text-sm flex items-start gap-2"
              >
                <div className="flex-1 min-w-0">
                  {n.judul && (
                    <p className="font-semibold text-slate-800 mb-0.5">
                      {n.judul}
                    </p>
                  )}
                  <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {n.body}
                  </p>
                </div>
                {onDeleteNote && (
                  <button
                    onClick={() => onDeleteNote(n.id)}
                    className="text-xs text-rose-500 hover:text-rose-700 px-2 py-0.5 rounded shrink-0"
                    title="Hapus catatan"
                  >
                    Hapus
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
