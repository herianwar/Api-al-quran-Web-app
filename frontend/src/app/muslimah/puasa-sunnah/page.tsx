"use client";

import { ArrowLeft, CalendarHeart, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PuasaSunnahResult } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

const LABEL_STYLE: Record<string, string> = {
  "Puasa Senin": "bg-sky-100 text-sky-700",
  "Puasa Kamis": "bg-sky-100 text-sky-700",
  "Ayyamul Bidh": "bg-indigo-100 text-indigo-700",
  "Puasa Arafah": "bg-amber-100 text-amber-700",
  "Puasa 'Asyura": "bg-amber-100 text-amber-700",
  "Puasa Tasu'a": "bg-amber-100 text-amber-700",
  "6 Hari Syawal": "bg-emerald-100 text-emerald-700",
};

export default function PuasaSunnahPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const { data } = useSWR<PuasaSunnahResult>(
    user ? "/muslimah/puasa-sunnah?hari=60" : null,
    fetcher,
  );

  if (loading || !user) return <Spinner label="Memuat…" />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/muslimah"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-emerald-600"
        >
          <ArrowLeft size={15} /> Muslimah
        </Link>
      </div>

      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 grid place-items-center">
          <CalendarHeart size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pengingat Puasa Sunnah</h1>
          <p className="text-sm text-slate-500">
            60 hari ke depan — disesuaikan dengan siklusmu.
          </p>
        </div>
      </header>

      {!data ? (
        <Spinner label="Menghitung…" />
      ) : data.puasaSunnah.length === 0 ? (
        <div className="card p-6 text-center text-sm text-slate-600">
          Tidak ada puasa sunnah pada rentang ini.
        </div>
      ) : (
        <div className="space-y-3">
          {data.puasaSunnah.map((d) => (
            <div
              key={d.tanggal}
              className={`card p-4 flex items-center gap-4 ${
                d.haid ? "opacity-60" : ""
              }`}
            >
              <div className="text-center shrink-0 w-14">
                <p className="text-[11px] uppercase text-slate-400">
                  {d.weekday.slice(0, 3)}
                </p>
                <p className="text-2xl font-bold text-slate-900 leading-none">
                  {d.tanggal.slice(8, 10)}
                </p>
                <p className="text-[11px] text-slate-400">
                  {d.tanggal.slice(5, 7)}/{d.tanggal.slice(2, 4)}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {d.utama && (
                    <Star
                      size={14}
                      className="text-amber-500 fill-amber-400 shrink-0"
                    />
                  )}
                  {d.label.map((l) => (
                    <span
                      key={l}
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                        LABEL_STYLE[l] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {l}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">{d.hijri}</p>
                {d.haid && (
                  <p className="text-xs text-rose-600 mt-0.5">
                    Bertepatan dengan masa haid — tidak berpuasa, cukup amalan
                    lain.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.hariTerlarang.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-2">
            Hari terlarang berpuasa
          </h2>
          <ul className="space-y-1.5 text-sm">
            {data.hariTerlarang.map((h) => (
              <li
                key={h.tanggal}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-slate-700">{h.sebab}</span>
                <span className="text-xs text-slate-400">
                  {h.weekday}, {h.tanggal}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-slate-400 leading-relaxed">
        Tanggal Hijriah memakai kalender tabular (akurasi ± 1 hari). Selalu cek
        pengumuman rukyat resmi untuk Arafah, Asyura, dan Idul Fitri/Adha.
      </p>
    </div>
  );
}
