"use client";

import { ArrowLeft, BookOpen, Lightbulb, Pause, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, fetcher } from "@/lib/api";
import type { AsmaulHusna } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

export default function AsmaulHusnaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = parseInt(params.id, 10);
  const valid = !isNaN(id) && id >= 1 && id <= 99;

  const { data, error, isLoading } = useSWR<AsmaulHusna>(
    valid ? `/asmaul-husna/${id}` : null,
    fetcher,
  );

  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function handlePlay() {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(
      `${API_URL}/asmaul-husna/${id}/audio?v=espeak`,
    );
    audio.addEventListener("ended", () => setPlaying(false));
    audio.addEventListener("error", () => setPlaying(false));
    audioRef.current = audio;
    setPlaying(true);
    void audio.play().catch(() => setPlaying(false));
  }

  if (!valid) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorBox message="Nomor Asmaul Husna tidak valid (harus 1-99)." />
      </div>
    );
  }

  const prevId = id > 1 ? id - 1 : null;
  const nextId = id < 99 ? id + 1 : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-700"
      >
        <ArrowLeft size={16} /> Kembali
      </button>

      {error && <ErrorBox message="Gagal memuat detail Asmaul Husna" />}

      {isLoading && <Skeleton className="h-72 w-full rounded-3xl" />}

      {data && (
        <>
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white p-5 sm:p-10 shadow-lg">
            <div className="absolute -top-4 -right-2 sm:-top-6 sm:-right-6 text-[8rem] sm:text-[12rem] font-black text-white/10 leading-none select-none">
              {data.id}
            </div>
            <div className="relative">
              <p className="text-[11px] uppercase tracking-[0.18em] text-amber-100/90 inline-flex items-center gap-1.5">
                <Sparkles size={14} /> Asmaul Husna #{data.id}
              </p>
              <p className="arabic text-5xl sm:text-7xl mt-3 sm:mt-4 leading-tight break-words">
                {data.arab}
              </p>
              <p className="text-2xl sm:text-3xl font-bold mt-3">{data.latin}</p>
              <p className="text-amber-50/90 text-base sm:text-lg mt-1">{data.arti}</p>
              <button
                onClick={handlePlay}
                className={`mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
                  playing
                    ? "bg-white text-orange-700"
                    : "bg-white/15 hover:bg-white/25 text-white"
                }`}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
                {playing ? "Hentikan" : "Putar"} Bacaan
              </button>
            </div>
          </section>

          {data.penjelasan && (
            <section className="card p-6 space-y-2">
              <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
                <BookOpen size={16} className="text-emerald-700" /> Penjelasan
              </h2>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                {data.penjelasan}
              </p>
            </section>
          )}

          {data.dalil && (
            <section className="card p-6 space-y-2">
              <h2 className="font-semibold text-slate-900">Dalil</h2>
              <p className="text-emerald-700 font-medium">{data.dalil}</p>
            </section>
          )}

          {data.faidah && (
            <section className="card p-6 space-y-2">
              <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
                <Lightbulb size={16} className="text-amber-600" /> Faidah
              </h2>
              <p className="text-slate-700 leading-relaxed">{data.faidah}</p>
            </section>
          )}

          <nav className="flex items-center justify-between text-sm">
            {prevId ? (
              <Link
                href={`/asmaul-husna/${prevId}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <ArrowLeft size={14} /> Nomor {prevId}
              </Link>
            ) : <span />}
            <Link
              href="/asmaul-husna"
              className="text-emerald-700 hover:text-emerald-800 font-medium"
            >
              Daftar 99 Nama
            </Link>
            {nextId ? (
              <Link
                href={`/asmaul-husna/${nextId}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Nomor {nextId} <ArrowLeft size={14} className="rotate-180" />
              </Link>
            ) : <span />}
          </nav>
        </>
      )}
    </div>
  );
}
