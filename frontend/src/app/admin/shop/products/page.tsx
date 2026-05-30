"use client";

import { Eye, EyeOff, Pencil, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { API_URL, apiFetch, fetcherFull, type ApiResponse } from "@/lib/api";
import { formatIdr, resolveImage } from "@/lib/shop";
import type { ShopProduct } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";

export default function AdminShopProductsPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (q.length >= 2) qs.set("q", q);

  const { data, error, isLoading, mutate } = useSWR<ApiResponse<ShopProduct[]>>(
    `/admin/shop/products?${qs.toString()}`,
    (k: string) => fetcherFull<ShopProduct[]>(k),
  );
  const products = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = (meta?.totalPages as number | undefined) ?? 1;
  const total = (meta?.total as number | undefined) ?? products.length;

  async function toggleActive(p: ShopProduct) {
    try {
      await apiFetch(`/admin/shop/products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      await mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal toggle");
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/shop"
        className="inline-block text-sm text-emerald-700 hover:underline"
      >
        ← Toko
      </Link>
      <PageHeader
        title="Produk"
        description={`${total} produk terdaftar.`}
        action={
          <Link
            href="/admin/shop/products/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
          >
            <Plus size={14} /> Produk baru
          </Link>
        }
      />

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Cari produk…"
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
      />

      {isLoading && <Spinner label="Memuat produk…" />}
      {error && <ErrorBox message={(error as Error).message} />}

      {products.length === 0 && !isLoading ? (
        <div className="card p-10 text-center">
          <ShoppingBag size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Belum ada produk.</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3 sm:p-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                {p.images?.[0]?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveImage(p.images[0].url, API_URL)}
                    alt={p.nama}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-slate-300">
                    <ShoppingBag size={22} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-semibold text-slate-900 text-sm truncate">
                    {p.nama}
                  </p>
                  {p.isFeatured && <span className="chip chip-gold">Pilihan</span>}
                  {!p.isActive && (
                    <span className="chip !bg-slate-100 !text-slate-600">
                      nonaktif
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {p.category?.nama ?? "—"} · {formatIdr(p.hargaIdr)}
                  {p.stok !== null && p.stok !== undefined ? ` · stok ${p.stok}` : ""}
                </p>
              </div>
              <button
                onClick={() => toggleActive(p)}
                className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50"
                aria-label={p.isActive ? "Nonaktifkan" : "Aktifkan"}
                title={p.isActive ? "Nonaktifkan" : "Aktifkan"}
              >
                {p.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <Link
                href={`/admin/shop/products/${p.id}`}
                className="rounded-lg border border-slate-200 bg-white p-2 hover:border-emerald-500 hover:text-emerald-700"
                aria-label="Edit"
              >
                <Pencil size={14} />
              </Link>
            </div>
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
