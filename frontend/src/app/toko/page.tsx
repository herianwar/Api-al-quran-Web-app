"use client";

import { Search, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { API_URL, fetcherFull, type ApiResponse, fetcher } from "@/lib/api";
import { formatIdr, resolveImage } from "@/lib/shop";
import type {
  ShopBanner,
  ShopCategory,
  ShopProduct,
  ShopSettings,
} from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { CardRowSkeleton, Skeleton } from "@/components/Skeleton";

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const ALL_KEY = "__all__";

export default function TokoPage() {
  const [activeCat, setActiveCat] = useState<string>(ALL_KEY);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q.trim());

  const { data: settings } = useSWR<ShopSettings>(
    "/shop/settings",
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: categories } = useSWR<ShopCategory[]>(
    "/shop/categories",
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: banners } = useSWR<ShopBanner[]>(
    "/shop/banners",
    fetcher,
    { revalidateOnFocus: false },
  );
  const visibleBanners = (banners ?? []).filter((b) => b.isActive && b.imageUrl);

  const qs = new URLSearchParams({ limit: "60" });
  if (activeCat !== ALL_KEY) qs.set("category", activeCat);
  if (debouncedQ.length >= 2) qs.set("q", debouncedQ);
  const productsSwr = useSWR<ApiResponse<ShopProduct[]>>(
    `/shop/products?${qs.toString()}`,
    (key: string) => fetcherFull<ShopProduct[]>(key),
  );
  const products = productsSwr.data?.data ?? [];
  const meta = productsSwr.data?.meta;
  const totalProducts = (meta?.total as number | undefined) ?? products.length;

  const visibleCategories = useMemo(
    () =>
      (categories ?? []).filter(
        (c) => c.isActive && (c.productCount ?? 0) > 0,
      ),
    [categories],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 text-white px-5 sm:px-9 py-7 sm:py-10 shadow-lg fade-in-up">
        <div
          aria-hidden
          className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-cyan-300/30 blur-3xl aurora"
        />
        <div
          aria-hidden
          className="absolute inset-0 dot-grid opacity-25"
          style={{
            maskImage: "radial-gradient(closest-side, black, transparent)",
          }}
        />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-50/90 uppercase tracking-[0.18em] mb-2">
            <ShoppingBag size={13} /> Toko
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-2">
            {settings?.shop_title ?? "Toko Rumah Qur'an"}
          </h1>
          <p className="text-emerald-50/90 max-w-xl text-sm sm:text-base leading-relaxed">
            {settings?.shop_description ??
              "Produk pilihan untuk menemani ibadah harian. Pesan langsung via WhatsApp."}
          </p>
        </div>
      </section>

      {/* Banner carousel */}
      {visibleBanners.length > 0 && (
        <section className="scroll-row -mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0 snap-x snap-mandatory">
          <div className="flex gap-3">
            {visibleBanners.map((b) => {
              const img = (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveImage(b.imageUrl ?? "", API_URL)}
                  alt={b.title ?? "Banner promosi"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              );
              const overlay = (b.title || b.subtitle) && (
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/55 via-black/10 to-transparent p-4 sm:p-6">
                  {b.title && (
                    <p className="text-white font-bold text-base sm:text-lg leading-tight drop-shadow">
                      {b.title}
                    </p>
                  )}
                  {b.subtitle && (
                    <p className="text-white/90 text-xs sm:text-sm leading-snug drop-shadow">
                      {b.subtitle}
                    </p>
                  )}
                </div>
              );
              const inner = (
                <>
                  {img}
                  {overlay}
                </>
              );
              const boxClass =
                "relative block shrink-0 snap-center w-[88vw] max-w-[680px] sm:w-full sm:max-w-none aspect-[16/7] sm:aspect-[16/5] rounded-2xl overflow-hidden bg-slate-100 shadow-sm";
              if (!b.linkUrl) {
                return (
                  <div key={b.id} className={boxClass}>
                    {inner}
                  </div>
                );
              }
              return b.linkUrl.startsWith("/") ? (
                <Link key={b.id} href={b.linkUrl} className={boxClass}>
                  {inner}
                </Link>
              ) : (
                <a
                  key={b.id}
                  href={b.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={boxClass}
                >
                  {inner}
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari produk…"
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
          />
        </div>
      </div>

      {/* Category chips */}
      {visibleCategories.length > 0 && (
        <div className="scroll-row -mx-4 px-4 overflow-x-auto sm:overflow-visible sm:mx-0 sm:px-0">
          <div className="flex gap-2 min-w-max sm:flex-wrap sm:min-w-0">
            <button
              onClick={() => setActiveCat(ALL_KEY)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition border ${
                activeCat === ALL_KEY
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
              }`}
            >
              Semua
            </button>
            {visibleCategories.map((c) => (
              <button
                key={c.slug}
                onClick={() => setActiveCat(c.slug)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition border ${
                  activeCat === c.slug
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                {c.nama}
                {c.productCount ? (
                  <span className="ml-1.5 text-[10px] opacity-70">
                    {c.productCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {productsSwr.error && (
        <ErrorBox message={(productsSwr.error as Error).message} />
      )}

      {productsSwr.isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardRowSkeleton key={i} />
          ))}
        </div>
      )}

      {!productsSwr.isLoading && products.length === 0 && (
        <div className="card p-10 text-center">
          <ShoppingBag size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {debouncedQ
              ? `Tidak ada produk cocok dengan "${debouncedQ}".`
              : "Belum ada produk di kategori ini."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {products.map((p) => {
          const firstImg = p.images?.[0]?.url;
          return (
            <Link
              key={p.id}
              href={`/toko/${p.slug}`}
              className="card glow-on-hover overflow-hidden fade-in-up flex flex-col"
            >
              <div className="aspect-square bg-slate-100 relative overflow-hidden">
                {firstImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveImage(firstImg, API_URL)}
                    alt={p.images?.[0]?.alt ?? p.nama}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-slate-300">
                    <ShoppingBag size={36} />
                  </div>
                )}
                {p.isFeatured && (
                  <span className="absolute top-2 left-2 chip chip-gold">
                    Pilihan
                  </span>
                )}
              </div>
              <div className="p-3.5 flex-1 flex flex-col">
                {p.category && (
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {p.category.nama}
                  </p>
                )}
                <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 mb-2">
                  {p.nama}
                </p>
                <div className="mt-auto flex items-baseline gap-2">
                  <p className="font-bold text-emerald-700 text-base">
                    {formatIdr(p.hargaIdr)}
                  </p>
                  {p.hargaCoret && p.hargaCoret > p.hargaIdr && (
                    <p className="text-xs text-slate-400 line-through">
                      {formatIdr(p.hargaCoret)}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {products.length > 0 && (
        <p className="text-center text-xs text-slate-400 pt-2 tabular-nums">
          {products.length} dari {totalProducts} produk
        </p>
      )}
    </div>
  );
}
