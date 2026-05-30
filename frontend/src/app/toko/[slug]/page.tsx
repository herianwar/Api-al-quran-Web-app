"use client";

import { Check, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import useSWR from "swr";
import { API_URL, fetcher } from "@/lib/api";
import { buildWaLink, formatIdr, resolveImage } from "@/lib/shop";
import type { ShopProduct, ShopSettings } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";
import { OrderForm } from "@/components/shop/OrderForm";

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [activeImg, setActiveImg] = useState(0);

  const productSwr = useSWR<ShopProduct>(
    `/shop/products/${slug}`,
    fetcher,
  );
  const { data: settings } = useSWR<ShopSettings>(
    "/shop/settings",
    fetcher,
    { revalidateOnFocus: false },
  );

  const product = productSwr.data;
  const waUrl =
    product && settings
      ? buildWaLink(product, {
          wa_number: settings.wa_number,
          wa_greeting: settings.wa_greeting,
        })
      : null;
  const inStock =
    product?.stok === null ||
    product?.stok === undefined ||
    (product?.stok ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <Link
        href="/toko"
        className="inline-block mb-4 text-sm text-emerald-700 hover:underline"
      >
        ← Kembali ke Toko
      </Link>

      {productSwr.error && (
        <ErrorBox message={(productSwr.error as Error).message} />
      )}

      {productSwr.isLoading && (
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton height={400} rounded="xl" />
          <div className="space-y-3">
            <Skeleton width="80%" height={28} />
            <Skeleton width="40%" height={20} />
            <Skeleton width="100%" height={14} />
            <Skeleton width="100%" height={14} />
            <Skeleton width="60%" height={14} />
          </div>
        </div>
      )}

      {product && (
        <div className="grid md:grid-cols-2 gap-6 lg:gap-10">
          {/* Image gallery */}
          <div>
            <div className="aspect-square rounded-2xl overflow-hidden bg-slate-100 mb-3 fade-in-up">
              {product.images && product.images.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveImage(product.images[activeImg].url, API_URL)}
                  alt={product.images[activeImg].alt ?? product.nama}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full grid place-items-center text-slate-300">
                  <ShoppingBag size={72} />
                </div>
              )}
            </div>
            {product.images && product.images.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {product.images.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setActiveImg(i)}
                    className={`aspect-square rounded-lg overflow-hidden bg-slate-100 ring-2 transition ${
                      i === activeImg
                        ? "ring-emerald-600"
                        : "ring-transparent hover:ring-emerald-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImage(img.url, API_URL)}
                      alt={img.alt ?? `${product.nama} ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="fade-in-up">
            {product.category && (
              <Link
                href={`/toko?cat=${product.category.slug}`}
                className="inline-block text-[11px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-0.5 mb-3"
              >
                {product.category.nama}
              </Link>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-3">
              {product.nama}
            </h1>

            <div className="flex items-baseline gap-3 mb-4">
              <p className="text-3xl font-bold text-emerald-700">
                {formatIdr(product.hargaIdr)}
              </p>
              {product.hargaCoret && product.hargaCoret > product.hargaIdr && (
                <p className="text-lg text-slate-400 line-through">
                  {formatIdr(product.hargaCoret)}
                </p>
              )}
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {inStock ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                  <Check size={12} />{" "}
                  {product.stok && product.stok > 0
                    ? `Stok: ${product.stok}`
                    : "Stok tersedia"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-1">
                  Stok habis
                </span>
              )}
            </div>

            {/* CTA — branches on the shop's order_mode setting. Out-of-stock
                products short-circuit to a disabled notice in both modes. */}
            {!inStock ? (
              <div className="mb-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3 font-semibold">
                Stok produk ini sedang habis.
              </div>
            ) : settings?.order_mode === "form" ? (
              <OrderForm
                product={product}
                settings={{
                  form_success_message: settings.form_success_message,
                  form_submit_label: settings.form_submit_label,
                }}
              />
            ) : waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-xl bg-[#25D366] hover:bg-[#1ebd5b] text-white font-bold px-6 py-3.5 text-base shadow-sm transition mb-6"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                Pesan via WhatsApp
              </a>
            ) : (
              <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
                Nomor WhatsApp toko belum dikonfigurasi. Hubungi admin.
              </div>
            )}

            {/* Description */}
            <div className="prose prose-slate max-w-none">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
                Deskripsi
              </h2>
              <p className="text-slate-700 text-[15px] leading-relaxed whitespace-pre-wrap">
                {product.deskripsi}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
