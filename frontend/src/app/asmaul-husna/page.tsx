"use client";

import { Pause, Play, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, fetcher } from "@/lib/api";
import type { AsmaulHusna } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

export default function AsmaulHusnaPage() {
  const { data, error, isLoading } = useSWR<AsmaulHusna[]>(
    "/asmaul-husna",
    fetcher,
    { revalidateOnFocus: false },
  );
  const [query, setQuery] = useState("");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup any playing audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function handlePlay(name: AsmaulHusna) {
    if (playingId === name.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    // ?v=espeak: server-generated TTS via espeak-ng. Bumping the version when
    // we change the voice/source invalidates the immutable client cache.
    const audio = new Audio(
      `${API_URL}/asmaul-husna/${name.id}/audio?v=espeak`,
    );
    audio.preload = "auto";
    audio.addEventListener("ended", () => setPlayingId(null));
    audio.addEventListener("error", () => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(name.id);
    void audio.play().catch(() => setPlayingId(null));
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (n) =>
        n.latin.toLowerCase().includes(q) ||
        n.arti.toLowerCase().includes(q) ||
        String(n.id) === q,
    );
  }, [data, query]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <Sparkles size={22} />
        </span>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Asmaul Husna
          </h1>
          <p className="text-sm text-slate-500">
            99 Nama Indah Allah ﷻ
          </p>
        </div>
      </div>

      <div className="relative mt-6 mb-5">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama (mis. Rahman, Ar-Razzaq, Pemberi Rezeki)…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
        />
      </div>

      {data && (
        <p className="text-xs text-slate-500 mb-4 tabular-nums">
          {filtered.length.toLocaleString("id-ID")} dari{" "}
          {data.length.toLocaleString("id-ID")} nama
        </p>
      )}

      {error && <ErrorBox message={error.message} />}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <Skeleton width={32} height={32} rounded="full" />
              <Skeleton width="60%" height={28} />
              <Skeleton width="40%" height={14} />
              <Skeleton width="80%" height={14} />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((n) => (
          <article
            key={n.id}
            className="card card-hover p-5 sm:p-6 fade-in-up relative overflow-hidden group"
          >
            <div className="absolute -top-2 -right-2 text-7xl font-bold text-emerald-50 select-none group-hover:text-emerald-100/70 transition">
              {n.id}
            </div>
            <div className="relative">
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="chip chip-gold">No. {n.id}</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePlay(n);
                  }}
                  aria-label={
                    playingId === n.id
                      ? `Stop bacaan ${n.latin}`
                      : `Putar bacaan ${n.latin}`
                  }
                  className={`grid h-9 w-9 place-items-center rounded-full transition shadow-sm ${
                    playingId === n.id
                      ? "bg-emerald-600 text-white animate-pulse"
                      : "bg-white border border-slate-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
                  }`}
                >
                  {playingId === n.id ? (
                    <Pause size={14} fill="currentColor" />
                  ) : (
                    <Play size={14} fill="currentColor" className="ml-0.5" />
                  )}
                </button>
              </div>
              <p className="arabic text-4xl text-right text-emerald-800 mb-3 leading-tight">
                {n.arab}
              </p>
              <p className="font-bold text-slate-900 text-lg mb-1">
                {n.latin}
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">
                {n.arti}
              </p>
              <Link
                href={`/asmaul-husna/${n.id}`}
                className="mt-3 inline-block text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                Lihat penjelasan →
              </Link>
            </div>
          </article>
        ))}
        {!isLoading && !error && filtered.length === 0 && (
          <p className="text-sm text-slate-500 col-span-full py-12 text-center">
            Nama tidak ditemukan. Coba kata kunci lain.
          </p>
        )}
      </div>
    </div>
  );
}
