"use client";

import { ArrowLeft, BookOpen, Quote } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

interface NabiDetail {
  id: number;
  urutan: number;
  slug: string;
  nama: string;
  namaArab: string;
  gelar: string | null;
  periode: string | null;
  ringkasan: string;
  kisah: string;
  ayatRujukan: { surah: number; ayat: number; catatan?: string }[] | null;
}

export default function NabiDetailPage() {
  const params = useParams<{ slug: string }>();
  const { data, error, isLoading } = useSWR<NabiDetail>(
    `/nabi/${params.slug}`,
    fetcher,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <Link
        href="/nabi"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-700"
      >
        <ArrowLeft size={14} /> Kembali ke daftar nabi
      </Link>

      {error && <ErrorBox message="Nabi tidak ditemukan" />}
      {isLoading && <Skeleton className="h-96 rounded-2xl" />}

      {data && (
        <article className="space-y-6">
          <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white p-5 sm:p-10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-100/90">
              Nabi #{data.urutan}
            </p>
            <p className="arabic text-4xl sm:text-5xl mt-3 break-words">{data.namaArab}</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
              {data.nama}
            </h1>
            {data.gelar && (
              <p className="text-amber-100 mt-1">{data.gelar}</p>
            )}
            {data.periode && (
              <p className="text-emerald-50/85 text-sm mt-1">{data.periode}</p>
            )}
          </header>

          <section className="card p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2 inline-flex items-center gap-1.5">
              <Quote size={12} /> Ringkasan
            </h2>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
              {data.ringkasan}
            </p>
          </section>

          <section className="card p-6 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 inline-flex items-center gap-1.5">
              <BookOpen size={12} /> Kisah Lengkap
            </h2>
            <div className="space-y-3">
              {data.kisah.split(/\n\n+/).map((para, i) => (
                <p
                  key={i}
                  className="text-slate-700 leading-relaxed whitespace-pre-wrap"
                >
                  {para}
                </p>
              ))}
            </div>
          </section>

          {data.ayatRujukan && data.ayatRujukan.length > 0 && (
            <section className="card p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-3">
                Ayat Rujukan
              </h2>
              <ul className="space-y-2">
                {data.ayatRujukan.map((r, i) => (
                  <li key={i}>
                    <Link
                      href={`/surat/${r.surah}#ayat-${r.ayat}`}
                      className="block text-sm hover:bg-emerald-50 rounded-lg px-3 py-2 transition"
                    >
                      <span className="font-semibold text-emerald-700">
                        Q.S. {r.surah}:{r.ayat}
                      </span>
                      {r.catatan && (
                        <span className="text-slate-500 ml-2">
                          — {r.catatan}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <nav className="flex items-center justify-between text-sm">
            {data.urutan > 1 ? (
              <Link
                href={`/nabi`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <ArrowLeft size={14} /> Kembali
              </Link>
            ) : <span />}
            <Link
              href="/sirah"
              className="text-emerald-700 hover:text-emerald-800 font-medium"
            >
              Baca Sirah Nabawi →
            </Link>
          </nav>
        </article>
      )}
    </div>
  );
}
