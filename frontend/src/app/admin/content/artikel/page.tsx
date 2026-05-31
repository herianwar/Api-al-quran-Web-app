"use client";

import { Eye, FileText, Pencil, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { API_URL, fetcherFull, type ApiResponse } from "@/lib/api";
import type { ArtikelListItem } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";

function resolveImg(url?: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) {
    return `${API_URL.replace(/\/api\/v\d+\/?$/, "")}${url}`;
  }
  return url;
}

export default function AdminArtikelPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (q.length >= 2) qs.set("q", q);
  if (status) qs.set("status", status);

  const { data, error, isLoading } = useSWR<ApiResponse<ArtikelListItem[]>>(
    `/admin/artikel?${qs.toString()}`,
    (k: string) => fetcherFull<ArtikelListItem[]>(k),
  );
  const items = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = (meta?.totalPages as number | undefined) ?? 1;
  const total = (meta?.total as number | undefined) ?? items.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Artikel"
        description={`${total} artikel.`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/content/artikel/kategori"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 px-3.5 py-2.5 text-sm font-semibold hover:bg-slate-50"
            >
              <Tag size={14} /> Kategori
            </Link>
            <Link
              href="/admin/content/artikel/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
            >
              <Plus size={14} /> Artikel baru
            </Link>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Cari artikel…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500 shadow-sm"
        >
          <option value="">Semua status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {isLoading && <Spinner label="Memuat artikel…" />}
      {error && <ErrorBox message={(error as Error).message} />}

      {items.length === 0 && !isLoading ? (
        <div className="card p-10 text-center">
          <FileText size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Belum ada artikel.</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {items.map((a) => (
            <Link
              key={a.id}
              href={`/admin/content/artikel/${a.id}`}
              className="flex items-center gap-3 p-3 sm:p-4 hover:bg-slate-50/70 transition"
            >
              <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                {a.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveImg(a.coverUrl)}
                    alt={a.judul}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-slate-300">
                    <FileText size={22} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-semibold text-slate-900 text-sm truncate">
                    {a.judul}
                  </p>
                  {a.isFeatured && <span className="chip chip-gold">Unggulan</span>}
                  <span
                    className={`chip ${
                      a.status === "published"
                        ? ""
                        : "!bg-amber-100 !text-amber-700"
                    }`}
                  >
                    {a.status === "published" ? "published" : "draft"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate flex items-center gap-2">
                  <span>{a.category?.nama ?? "Tanpa kategori"}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Eye size={11} /> {a.views}
                  </span>
                  <span>·</span>
                  <span>{a.menitBaca} mnt baca</span>
                </p>
              </div>
              <span className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500">
                <Pencil size={14} />
              </span>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold disabled:opacity-40"
          >
            ← Sebelumnya
          </button>
          <span className="text-sm text-slate-500 tabular-nums">
            Hal {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold disabled:opacity-40"
          >
            Selanjutnya →
          </button>
        </div>
      )}
    </div>
  );
}
