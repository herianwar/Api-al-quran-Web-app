"use client";

import Link from "next/link";
import { use, useState } from "react";
import useSWR from "swr";
import { fetcherFull, type ApiResponse } from "@/lib/api";
import type { Hadis, Perawi } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";

const LIMIT = 25;

export default function HadisPerawiPage({
  params,
}: {
  params: Promise<{ perawi: string }>;
}) {
  const { perawi: perawiSlug } = use(params);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");

  const qs = new URLSearchParams({
    page: String(page),
    limit: String(LIMIT),
    ...(submittedQ ? { q: submittedQ } : {}),
  });
  const swr = useSWR<ApiResponse<Hadis[]>>(
    `/hadith/${perawiSlug}?${qs.toString()}`,
    (key: string) => fetcherFull<Hadis[]>(key),
  );
  const rows = swr.data?.data ?? [];
  const meta = swr.data?.meta;
  const totalPages = (meta?.totalPages as number | undefined) ?? 1;
  const hasMore = (meta?.hasMore as boolean | undefined) ?? false;
  const perawiInfo = meta?.perawi as Perawi | undefined;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQ(q.trim());
    setPage(1);
  }

  function resetSearch() {
    setQ("");
    setSubmittedQ("");
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/hadis"
        className="inline-block mb-4 text-sm text-emerald-700 hover:underline"
      >
        ← Semua perawi
      </Link>

      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          HR. {perawiInfo?.nama ?? perawiSlug}
        </h1>
        {perawiInfo && (
          <span className="text-sm text-slate-500 font-medium tabular-nums">
            {perawiInfo.total.toLocaleString("id-ID")} hadis
          </span>
        )}
      </div>
      <p className="text-slate-600 mb-6 leading-relaxed">
        Klik hadis untuk lihat detail. Cari dengan kata kunci di kolom bawah.
      </p>

      <form onSubmit={submitSearch} className="mb-6 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari di teks arab / terjemahan…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
        />
        <button
          type="submit"
          disabled={q.trim().length < 2 && !submittedQ}
          className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition shadow-sm"
        >
          Cari
        </button>
        {submittedQ && (
          <button
            type="button"
            onClick={resetSearch}
            className="px-3 py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
        )}
      </form>

      {submittedQ && (
        <p className="text-sm text-slate-500 mb-4">
          Menampilkan {rows.length} hasil untuk{" "}
          <span className="font-semibold text-slate-700">
            &ldquo;{submittedQ}&rdquo;
          </span>
          {hasMore ? " (ada lebih banyak — klik Selanjutnya)" : ""}
        </p>
      )}

      {swr.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-2">
              <Skeleton width={140} height={14} />
              <Skeleton width="100%" height={20} />
              <Skeleton width="92%" height={14} />
              <Skeleton width="75%" height={14} />
            </div>
          ))}
        </div>
      )}
      {swr.error && <ErrorBox message={(swr.error as Error).message} />}

      <div className="space-y-3">
        {rows.map((h) => (
          <Link
            key={h.id}
            href={`/hadis/${perawiSlug}/${h.nomor}`}
            className="block card p-5 hover:shadow-md hover:border-emerald-300 transition"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-white text-xs font-bold tabular-nums">
                {h.nomor}
              </span>
              <span className="text-xs text-slate-500">
                HR. {perawiInfo?.nama ?? perawiSlug} no. {h.nomor}
              </span>
            </div>
            {h.arab && (
              <p className="arabic arabic-body text-right text-slate-900 mb-2 line-clamp-3">
                {h.arab}
              </p>
            )}
            <p className="text-[15px] leading-relaxed text-slate-700 line-clamp-3">
              {h.terjemahan}
            </p>
          </Link>
        ))}
      </div>

      {!swr.isLoading && rows.length === 0 && (
        <p className="text-sm text-slate-500 py-12 text-center">
          {submittedQ
            ? `Tidak ada hadis cocok dengan "${submittedQ}".`
            : "Tidak ada data."}
        </p>
      )}

      {meta && (page > 1 || hasMore) && (
        <div className="flex items-center justify-between mt-8 gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Sebelumnya
          </button>
          <span className="text-sm text-slate-500 tabular-nums">
            Halaman {page}
            {totalPages > 1 ? ` dari ${totalPages.toLocaleString("id-ID")}` : ""}
          </span>
          <button
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Selanjutnya →
          </button>
        </div>
      )}
    </div>
  );
}
