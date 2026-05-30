"use client";

import {
  ClipboardList,
  FormInput,
  ImageIcon,
  Layers,
  Phone,
  Settings as SettingsIcon,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { ShopCategory, ShopSettings } from "@/lib/types";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

interface ProductsMeta {
  total?: number;
}

interface OrderStats {
  total: number;
  today: number;
  baru: number;
}

export default function AdminShopOverviewPage() {
  const { data: categories } = useSWR<ShopCategory[]>(
    "/admin/shop/categories",
    fetcher,
  );
  const { data: settings } = useSWR<ShopSettings>(
    "/admin/shop/settings",
    fetcher,
  );
  // products endpoint returns paginated envelope; use direct fetch to read meta.
  const { data: productsMeta } = useSWR<{ data: unknown[]; meta?: ProductsMeta }>(
    "/admin/shop/products?limit=1",
    async (path: string) => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}${path}`);
      const json = await res.json();
      return json;
    },
    { revalidateOnFocus: false },
  );
  const productTotal = (productsMeta?.meta?.total as number | undefined) ?? 0;
  const { data: orderStats } = useSWR<OrderStats>(
    "/admin/shop/orders/stats",
    fetcher,
  );
  const orderMode = settings?.order_mode === "form" ? "Form" : "WhatsApp";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Toko"
        description="Kelola produk, kategori, metode order (WA/Form), dan laporan pesanan."
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Produk"
          value={productTotal}
          icon={ShoppingBag}
          tone="emerald"
        />
        <StatCard
          label="Kategori"
          value={categories?.length ?? 0}
          icon={Layers}
          tone="indigo"
        />
        <StatCard
          label="Order Baru"
          value={orderStats?.baru ?? 0}
          icon={ClipboardList}
          tone="amber"
          hint={`${orderStats?.total ?? 0} total`}
        />
        <StatCard
          label="Metode Order"
          value={orderMode}
          icon={settings?.order_mode === "form" ? FormInput : Phone}
          tone="sky"
          hint={
            settings?.order_mode === "form"
              ? "Form order aktif"
              : settings?.wa_number || "WA belum di-set"
          }
        />
      </section>

      <section>
        <SectionHeader title="Manage" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/admin/shop/products"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <ShoppingBag size={18} className="text-emerald-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">Produk</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Tambah, edit, dan kelola produk
            </p>
          </Link>
          <Link
            href="/admin/shop/categories"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <Layers size={18} className="text-indigo-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">Kategori</p>
            <p className="text-xs text-slate-500 mt-0.5">
              CRUD kategori produk
            </p>
          </Link>
          <Link
            href="/admin/shop/banners"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <ImageIcon size={18} className="text-rose-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">Banner</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Banner promosi carousel /toko
            </p>
          </Link>
          <Link
            href="/admin/shop/orders"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <ClipboardList size={18} className="text-amber-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">
              Laporan Order
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Pesanan masuk, status, export CSV
            </p>
          </Link>
          <Link
            href="/admin/shop/form-builder"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <FormInput size={18} className="text-sky-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">Form Builder</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur field form order dinamis
            </p>
          </Link>
          <Link
            href="/admin/shop/settings"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <SettingsIcon size={18} className="text-slate-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">Setting</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Metode order, WA, judul
            </p>
          </Link>
          <Link
            href="/toko"
            target="_blank"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <ShoppingBag size={18} className="text-amber-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">
              Lihat toko publik
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Buka /toko di tab baru
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
