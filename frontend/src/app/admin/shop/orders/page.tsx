"use client";

import {
  ClipboardList,
  Clock,
  Download,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  apiFetch,
  apiFetchRaw,
  fetcher,
  fetcherFull,
  type ApiResponse,
} from "@/lib/api";
import { formatIdr } from "@/lib/shop";
import type { ShopOrder, ShopOrderStatus } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

const STATUSES: { value: ShopOrderStatus; label: string; cls: string }[] = [
  { value: "baru", label: "Baru", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  {
    value: "diproses",
    label: "Diproses",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    value: "dikirim",
    label: "Dikirim",
    cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    value: "selesai",
    label: "Selesai",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    value: "batal",
    label: "Batal",
    cls: "bg-rose-50 text-rose-700 border-rose-200",
  },
];

function statusMeta(s: string) {
  return (
    STATUSES.find((x) => x.value === s) ?? {
      value: s as ShopOrderStatus,
      label: s,
      cls: "bg-slate-100 text-slate-600 border-slate-200",
    }
  );
}

interface OrderStats {
  total: number;
  today: number;
  baru: number;
  byStatus: Record<string, number>;
  revenueIdr: number;
}

function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminOrdersPage() {
  const [status, setStatus] = useState<ShopOrderStatus | "">("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q.trim());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ShopOrder | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: stats, mutate: mutateStats } = useSWR<OrderStats>(
    "/admin/shop/orders/stats",
    fetcher,
  );

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: "20", page: String(page) });
    if (status) p.set("status", status);
    if (debouncedQ.length >= 2) p.set("q", debouncedQ);
    return p.toString();
  }, [status, debouncedQ, page]);

  const { data, error, isLoading, mutate } = useSWR<ApiResponse<ShopOrder[]>>(
    `/admin/shop/orders?${qs}`,
    (key: string) => fetcherFull<ShopOrder[]>(key),
  );
  const orders = data?.data ?? [];
  const meta = data?.meta as
    | { total: number; page: number; totalPages: number; hasMore: boolean }
    | undefined;

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [status, debouncedQ]);

  async function refreshAll() {
    await Promise.all([mutate(), mutateStats()]);
  }

  async function setOrderStatus(
    order: ShopOrder,
    newStatus: ShopOrderStatus,
    adminNote?: string,
  ) {
    setErr(null);
    try {
      const res = await apiFetch<ShopOrder>(
        `/admin/shop/orders/${order.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus, adminNote }),
        },
      );
      await refreshAll();
      setSelected((s) => (s && s.id === order.id ? { ...s, ...res.data } : s));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal update status");
    }
  }

  async function remove(order: ShopOrder) {
    if (!confirm(`Hapus order ${order.orderNumber}?`)) return;
    setErr(null);
    try {
      await apiFetch(`/admin/shop/orders/${order.id}`, { method: "DELETE" });
      setSelected(null);
      await refreshAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal hapus order");
    }
  }

  async function exportCsv() {
    setDownloading(true);
    setErr(null);
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (debouncedQ.length >= 2) p.set("q", debouncedQ);
      const res = await apiFetchRaw(
        `/admin/shop/orders/export?${p.toString()}`,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "orders.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal export CSV");
    } finally {
      setDownloading(false);
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
        title="Laporan Order"
        description="Pesanan masuk via form order. Filter, update status, dan export."
        action={
          <button
            onClick={exportCsv}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={14} />
            {downloading ? "Mengunduh…" : "Export CSV"}
          </button>
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Order"
          value={stats?.total ?? 0}
          icon={ClipboardList}
          tone="indigo"
        />
        <StatCard
          label="Hari Ini"
          value={stats?.today ?? 0}
          icon={Clock}
          tone="sky"
        />
        <StatCard
          label="Order Baru"
          value={stats?.baru ?? 0}
          icon={ClipboardList}
          tone="amber"
        />
        <StatCard
          label="Omzet"
          value={stats ? formatIdr(stats.revenueIdr) : "—"}
          icon={Wallet}
          tone="emerald"
          hint="Tidak termasuk batal"
        />
      </section>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari no order, nama, no HP, produk…"
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatus("")}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
            status === ""
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300"
          }`}
        >
          Semua
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
              status === s.value
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300"
            }`}
          >
            {s.label}
            {stats?.byStatus?.[s.value] ? (
              <span className="ml-1.5 opacity-70">
                {stats.byStatus[s.value]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {err && <ErrorBox message={err} />}
      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading && <Spinner label="Memuat order…" />}

      {data && orders.length === 0 && !isLoading && (
        <div className="card p-10 text-center">
          <ClipboardList size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Belum ada order.</p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="card divide-y divide-slate-100">
          {orders.map((o) => {
            const sm = statusMeta(o.status);
            return (
              <button
                key={o.id}
                onClick={() => setSelected(o)}
                className="w-full text-left flex items-center gap-3 p-4 hover:bg-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-700">
                      {o.orderNumber}
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase border rounded-full px-2 py-0.5 ${sm.cls}`}
                    >
                      {sm.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {o.customerName || "—"}{" "}
                    <span className="font-normal text-slate-400">
                      · {o.productName}
                      {o.quantity > 1 ? ` ×${o.quantity}` : ""}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">{fmtDate(o.createdAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-emerald-700 text-sm tabular-nums">
                    {formatIdr(o.totalIdr)}
                  </p>
                  {o.customerPhone && (
                    <p className="text-xs text-slate-400">{o.customerPhone}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40 hover:bg-slate-50"
          >
            ←
          </button>
          <span className="text-sm text-slate-500 tabular-nums">
            Hal {meta.page} / {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!meta.hasMore}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40 hover:bg-slate-50"
          >
            →
          </button>
        </div>
      )}

      {selected && (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onStatus={(s, note) => setOrderStatus(selected, s, note)}
          onDelete={() => remove(selected)}
        />
      )}
    </div>
  );
}

function OrderDetail({
  order,
  onClose,
  onStatus,
  onDelete,
}: {
  order: ShopOrder;
  onClose: () => void;
  onStatus: (status: ShopOrderStatus, note?: string) => void;
  onDelete: () => void;
}) {
  const [note, setNote] = useState(order.adminNote ?? "");
  const sm = statusMeta(order.status);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex justify-end">
      <div className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <p className="font-mono font-bold text-slate-900">
              {order.orderNumber}
            </p>
            <p className="text-xs text-slate-400">{fmtDate(order.createdAt)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Product */}
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900 text-sm">
                {order.productName}
              </p>
              {order.productSlug && order.product?.isActive && (
                <Link
                  href={`/toko/${order.productSlug}`}
                  target="_blank"
                  className="text-xs text-emerald-700 hover:underline shrink-0"
                >
                  Lihat
                </Link>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {formatIdr(order.hargaIdr)} × {order.quantity} ={" "}
              <span className="font-bold text-emerald-700">
                {formatIdr(order.totalIdr)}
              </span>
            </p>
          </div>

          {/* Submitted fields */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Data Pelanggan
            </p>
            <dl className="space-y-2">
              {order.fields?.length ? (
                order.fields.map((f) => (
                  <div key={f.key}>
                    <dt className="text-[11px] font-semibold text-slate-500">
                      {f.label}
                    </dt>
                    <dd className="text-sm text-slate-900 whitespace-pre-wrap break-words">
                      {f.value || "—"}
                    </dd>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">Tidak ada data field.</p>
              )}
            </dl>
          </div>

          {/* Status */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Status saat ini:{" "}
              <span
                className={`normal-case border rounded-full px-2 py-0.5 ${sm.cls}`}
              >
                {sm.label}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => onStatus(s.value, note)}
                  disabled={s.value === order.status}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed ${s.cls}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Admin note */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Catatan admin
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Catatan internal (disimpan saat update status)…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={() => onStatus(order.status, note)}
                className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-900"
              >
                Simpan catatan
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-100">
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 text-rose-600 text-sm font-semibold hover:underline"
          >
            <Trash2 size={14} /> Hapus order
          </button>
        </div>
      </div>
    </div>
  );
}
