"use client";

import { ArrowLeft, Clock, Eye, Pencil, User } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import useSWR from "swr";
import { API_URL, fetcher } from "@/lib/api";
import type { Artikel } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { ArticleContent } from "@/components/article/ArticleContent";

function resolveImg(url?: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) {
    return `${API_URL.replace(/\/api\/v\d+\/?$/, "")}${url}`;
  }
  return url;
}

function formatTanggal(d?: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function ArtikelPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: a, error, isLoading } = useSWR<Artikel>(
    `/admin/artikel/${id}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) return <Spinner label="Memuat pratinjau…" />;
  if (error || !a) return <ErrorBox message="Artikel tidak ditemukan." />;

  return (
    <div className="space-y-4">
      {/* Preview banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold uppercase text-white">
            Pratinjau
          </span>
          <span className="text-amber-800">
            Status:{" "}
            <strong>{a.status === "published" ? "Published" : "Draft"}</strong>
            {a.status === "draft" && " — belum tampil ke publik"}
          </span>
        </div>
        <Link
          href={`/admin/content/artikel/${id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
        >
          <Pencil size={14} /> Kembali edit
        </Link>
      </div>

      {/* Rendered exactly like the public detail page */}
      <article className="mx-auto max-w-3xl py-4">
        <Link
          href="/admin/content/artikel"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline mb-6"
        >
          <ArrowLeft size={15} /> Artikel
        </Link>

        <header className="mb-6">
          {a.category && <span className="chip mb-3 inline-block">{a.category.nama}</span>}
          <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 leading-tight tracking-tight">
            {a.judul}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
            {a.penulis && (
              <span className="inline-flex items-center gap-1.5">
                <User size={14} /> {a.penulis}
              </span>
            )}
            <span>{formatTanggal(a.publishedAt) || "Belum terbit"}</span>
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
          </figure>
        )}

        <ArticleContent html={a.konten} />

        {a.tags && a.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-100 pt-6">
            {a.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
