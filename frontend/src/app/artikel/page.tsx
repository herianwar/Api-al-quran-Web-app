"use client";

import { Clock, FileText, Search, Star, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { API_URL, fetcherFull, type ApiResponse } from "@/lib/api";
import type { ArtikelKategori, ArtikelListItem } from "@/lib/types";

export function resolveImg(url?: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) {
    return `${API_URL.replace(/\/api\/v\d+\/?$/, "")}${url}`;
  }
  return url;
}

export function formatTanggal(d?: string | null): string {
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

export default function ArtikelListPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8" />}>
      <ArtikelListInner />
    </Suspense>
  );
}

function ArtikelListInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [kategori, setKategori] = useState(() => params.get("kategori") ?? "");
  const [tag, setTag] = useState(() => params.get("tag") ?? "");
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), limit: "12" });
  if (q.length >= 2) qs.set("q", q);
  if (kategori) qs.set("kategori", kategori);
  if (tag) qs.set("tag", tag);

  const { data: cats } = useSWR<ApiResponse<ArtikelKategori[]>>(
    "/artikel/kategori",
    (k: string) => fetcherFull<ArtikelKategori[]>(k),
  );
  const { data, isLoading } = useSWR<ApiResponse<ArtikelListItem[]>>(
    `/artikel?${qs.toString()}`,
    (k: string) => fetcherFull<ArtikelListItem[]>(k),
  );

  // Featured strip only on the unfiltered first page.
  const { data: featuredData } = useSWR<ApiResponse<ArtikelListItem[]>>(
    page === 1 && !q && !kategori && !tag
      ? "/artikel?featured=true&limit=3"
      : null,
    (k: string) => fetcherFull<ArtikelListItem[]>(k),
  );

  const items = data?.data ?? [];
  const featured = featuredData?.data ?? [];
  const meta = data?.meta;
  const totalPages = (meta?.totalPages as number | undefined) ?? 1;
  const categories = cats?.data ?? [];

  const isPlain = !q && !kategori && !tag && page === 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Hero */}
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-1">
          Portal Artikel
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Artikel Rumah Qur&apos;an
        </h1>
        <p className="text-slate-500 mt-1.5 text-sm sm:text-base max-w-2xl">
          Kajian, kisah inspiratif, dan panduan ibadah harian — ditulis ringkas
          agar mudah dipahami dan diamalkan.
        </p>
      </header>

      {/* Search + categories */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Cari artikel…"
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
          />
        </div>
        {tag && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Tag:</span>
            <button
              onClick={() => {
                setTag("");
                setPage(1);
              }}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white"
            >
              #{tag}
              <X size={13} />
            </button>
          </div>
        )}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Chip active={!kategori} onClick={() => { setKategori(""); setPage(1); }}>
              Semua
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={kategori === c.slug}
                onClick={() => {
                  setKategori(c.slug);
                  setPage(1);
                }}
              >
                {c.nama}
                {typeof c.jumlahArtikel === "number" && c.jumlahArtikel > 0 && (
                  <span className="ml-1 opacity-60">{c.jumlahArtikel}</span>
                )}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* Featured */}
      {isPlain && featured.length > 0 && (
        <section className="mb-10 grid gap-4 md:grid-cols-3">
          {featured.map((a, i) => (
            <FeaturedCard key={a.id} a={a} big={i === 0} />
          ))}
        </section>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="aspect-video rounded-lg bg-slate-100 mb-3" />
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {q || kategori
              ? "Tidak ada artikel yang cocok."
              : "Belum ada artikel."}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <ArticleCard key={a.id} a={a} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => {
              setPage((p) => p - 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold disabled:opacity-40 hover:bg-slate-50"
          >
            ← Sebelumnya
          </button>
          <span className="text-sm text-slate-500 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => {
              setPage((p) => p + 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold disabled:opacity-40 hover:bg-slate-50"
          >
            Selanjutnya →
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
      }`}
    >
      {children}
    </button>
  );
}

function ArticleCard({ a }: { a: ArtikelListItem }) {
  return (
    <Link
      href={`/artikel/${a.slug}`}
      className="card card-hover overflow-hidden flex flex-col group"
    >
      <div className="aspect-video bg-slate-100 overflow-hidden">
        {a.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImg(a.coverUrl)}
            alt={a.coverAlt ?? a.judul}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-slate-300">
            <FileText size={28} />
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        {a.category && (
          <span className="chip self-start mb-2">{a.category.nama}</span>
        )}
        <h2 className="font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-700 transition">
          {a.judul}
        </h2>
        {a.ringkasan && (
          <p className="text-sm text-slate-500 mt-1.5 line-clamp-2 flex-1">
            {a.ringkasan}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          {a.publishedAt && <span>{formatTanggal(a.publishedAt)}</span>}
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {a.menitBaca} mnt
          </span>
        </div>
      </div>
    </Link>
  );
}

function FeaturedCard({ a, big }: { a: ArtikelListItem; big: boolean }) {
  return (
    <Link
      href={`/artikel/${a.slug}`}
      className={`relative overflow-hidden rounded-2xl group ${
        big ? "md:col-span-2 md:row-span-1 min-h-[240px]" : "min-h-[240px]"
      }`}
    >
      {a.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveImg(a.coverUrl)}
          alt={a.coverAlt ?? a.judul}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 to-teal-600" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="relative h-full flex flex-col justify-end p-5">
        <span className="inline-flex items-center gap-1 self-start rounded-full bg-amber-400/90 text-amber-950 px-2.5 py-0.5 text-[11px] font-bold mb-2">
          <Star size={11} /> Unggulan
        </span>
        <h2
          className={`font-bold text-white leading-tight ${
            big ? "text-xl sm:text-2xl" : "text-lg"
          } line-clamp-3`}
        >
          {a.judul}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
          {a.category && <span>{a.category.nama}</span>}
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {a.menitBaca} mnt
          </span>
        </div>
      </div>
    </Link>
  );
}
