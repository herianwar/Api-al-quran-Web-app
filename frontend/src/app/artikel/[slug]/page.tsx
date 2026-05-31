"use client";

import { ArrowLeft, Clock, Eye, FileText, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { Artikel } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { ArticleContent } from "@/components/article/ArticleContent";
import { ArticleShare } from "@/components/article/ArticleShare";
import { ReadingProgress } from "@/components/article/ReadingProgress";
import { resolveImg, formatTanggal } from "../page";

export default function ArtikelDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const { data: a, error, isLoading } = useSWR<Artikel>(
    slug ? `/artikel/${slug}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 animate-pulse">
        <div className="h-8 bg-slate-100 rounded w-3/4 mb-4" />
        <div className="aspect-video bg-slate-100 rounded-2xl mb-6" />
        <div className="space-y-3">
          <div className="h-4 bg-slate-100 rounded w-full" />
          <div className="h-4 bg-slate-100 rounded w-full" />
          <div className="h-4 bg-slate-100 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (error || !a) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <FileText size={40} className="text-slate-300 mx-auto mb-4" />
        <ErrorBox message="Artikel tidak ditemukan." />
        <Link
          href="/artikel"
          className="inline-block mt-5 text-sm font-semibold text-emerald-700 hover:underline"
        >
          ← Kembali ke daftar artikel
        </Link>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <ReadingProgress />
      <Link
        href="/artikel"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline mb-6"
      >
        <ArrowLeft size={15} /> Semua artikel
      </Link>

      <header className="mb-6">
        {a.category && (
          <Link
            href={`/artikel?kategori=${a.category.slug}`}
            className="chip mb-3 inline-block hover:opacity-80"
          >
            {a.category.nama}
          </Link>
        )}
        <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 leading-tight tracking-tight">
          {a.judul}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
          {a.penulis && (
            <span className="inline-flex items-center gap-1.5">
              <User size={14} /> {a.penulis}
            </span>
          )}
          {a.publishedAt && <span>{formatTanggal(a.publishedAt)}</span>}
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} /> {a.menitBaca} menit baca
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Eye size={14} /> {a.views}
          </span>
        </div>
      </header>

      {a.coverUrl && (
        <figure className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveImg(a.coverUrl)}
            alt={a.coverAlt ?? a.judul}
            className="w-full rounded-2xl object-cover max-h-[460px]"
          />
          {a.coverAlt && (
            <figcaption className="mt-2 text-center text-xs text-slate-400">
              {a.coverAlt}
            </figcaption>
          )}
        </figure>
      )}

      {/* Body — sanitized server-side; TOC + anchors added client-side. */}
      <ArticleContent html={a.konten} />

      {a.tags && a.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {a.tags.map((t) => (
            <Link
              key={t}
              href={`/artikel?tag=${encodeURIComponent(t)}`}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 border-t border-slate-100 pt-6">
        <ArticleShare title={a.judul} />
      </div>

      {/* Related */}
      {a.related && a.related.length > 0 && (
        <section className="mt-12 border-t border-slate-100 pt-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4">
            Artikel terkait
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {a.related.map((r) => (
              <Link
                key={r.id}
                href={`/artikel/${r.slug}`}
                className="card card-hover flex gap-3 p-3 group"
              >
                <div className="w-20 h-20 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                  {r.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveImg(r.coverUrl)}
                      alt={r.judul}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-slate-300">
                      <FileText size={20} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 group-hover:text-emerald-700 transition">
                    {r.judul}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 inline-flex items-center gap-1">
                    <Clock size={10} /> {r.menitBaca} mnt
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
