"use client";

import { Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, fetcher } from "@/lib/api";
import type { Adzan } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

/** Format detik → "m:ss" untuk badge durasi. */
function fmtDur(sec?: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AdzanPage() {
  const { data, error, isLoading } = useSWR<Adzan[]>("/adzan", fetcher, {
    revalidateOnFocus: false,
  });
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Hentikan audio yang sedang diputar saat komponen di-unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function handlePlay(item: Adzan) {
    if (playingId === item.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    // Stream langsung dari proxy lokal self-hosted (api_key dibawa via cookie).
    const audio = new Audio(`${API_URL}/adzan/${item.id}/audio`);
    audio.preload = "auto";
    audio.addEventListener("ended", () => setPlayingId(null));
    audio.addEventListener("error", () => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(item.id);
    void audio.play().catch(() => setPlayingId(null));
  }

  const items = useMemo(() => data ?? [], [data]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <Volume2 size={22} />
        </span>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Audio Adzan
          </h1>
          <p className="text-sm text-slate-500">
            Koleksi suara adzan — di-host sendiri, putar langsung di sini
          </p>
        </div>
      </div>

      {data && (
        <p className="text-xs text-slate-500 mb-4 tabular-nums">
          {items.length.toLocaleString("id-ID")} rekaman tersedia
        </p>
      )}

      {error && <ErrorBox message={error.message} />}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <Skeleton width={36} height={36} rounded="full" />
              <Skeleton width="60%" height={22} />
              <Skeleton width="40%" height={14} />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => {
          const dur = fmtDur(item.durasi);
          const active = playingId === item.id;
          return (
            <article
              key={item.id}
              className="card card-hover p-5 sm:p-6 fade-in-up flex items-center gap-4"
            >
              <button
                onClick={() => handlePlay(item)}
                aria-label={active ? `Stop ${item.judul}` : `Putar ${item.judul}`}
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition shadow-sm ${
                  active
                    ? "bg-emerald-600 text-white animate-pulse"
                    : "bg-white border border-slate-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
                }`}
              >
                {active ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" className="ml-0.5" />
                )}
              </button>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 leading-tight truncate">
                  {item.judul}
                </p>
                {(item.muadzin || item.lokasi) && (
                  <p className="text-sm text-slate-600 truncate">
                    {[item.muadzin, item.lokasi].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span
                    className={`chip ${
                      item.jenis === "subuh" ? "chip-gold" : ""
                    }`}
                  >
                    {item.jenis === "subuh" ? "Adzan Subuh" : "Adzan"}
                  </span>
                  {dur && (
                    <span className="text-xs text-slate-500 tabular-nums">
                      {dur} menit
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!isLoading && !error && items.length === 0 && (
          <p className="text-sm text-slate-500 col-span-full py-12 text-center">
            Belum ada audio adzan. Jalankan seeding adzan terlebih dahulu.
          </p>
        )}
      </div>
    </div>
  );
}
