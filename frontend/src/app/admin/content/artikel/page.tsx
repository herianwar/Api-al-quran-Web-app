"use client";

import {
  CalendarClock,
  CheckSquare,
  Copy,
  Eye,
  FileText,
  Pencil,
  Plus,
  Square,
  Star,
  Tag,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  apiFetch,
  API_URL,
  fetcher,
  fetcherFull,
  type ApiResponse,
} from "@/lib/api";
import type { ArtikelKategori, ArtikelListItem } from "@/lib/types";
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

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function StatusBadge({ a }: { a: ArtikelListItem }) {
  if (a.status === "published") return <span className="chip">published</span>;
  if (a.status === "scheduled")
    return (
      <span className="chip !bg-sky-100 !text-sky-700 inline-flex items-center gap-1">
        <CalendarClock size={11} /> {formatWhen(a.scheduledAt) || "terjadwal"}
      </span>
    );
  return <span className="chip !bg-amber-100 !text-amber-700">draft</span>;
}

export default function AdminArtikelPage() {
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [kategori, setKategori] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounce the search box → one request per pause, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim().length >= 2 ? qInput.trim() : "");
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  if (kategori) qs.set("kategori", kategori);

  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<ArtikelListItem[]>
  >(`/admin/artikel?${qs.toString()}`, (k: string) =>
    fetcherFull<ArtikelListItem[]>(k),
  );
  const { data: categories } = useSWR<ArtikelKategori[]>(
    "/admin/artikel/kategori",
    fetcher,
  );

  const items = useMemo(() => data?.data ?? [], [data]);
  const meta = data?.meta;
  const totalPages = (meta?.totalPages as number | undefined) ?? 1;
  const total = (meta?.total as number | undefined) ?? items.length;

  const allSelected = items.length > 0 && items.every((a) => sel.has(a.id));

  function toggle(id: number) {
    setSel((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSel(() => (allSelected ? new Set() : new Set(items.map((a) => a.id))));
  }

  async function bulk(
    action: "publish" | "draft" | "feature" | "unfeature" | "delete",
  ) {
    if (sel.size === 0) return;
    if (
      action === "delete" &&
      !confirm(`Hapus ${sel.size} artikel terpilih? Tidak bisa di-undo.`)
    )
      return;
    setBulkBusy(true);
    try {
      await apiFetch("/admin/artikel/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...sel], action }),
      });
      setSel(new Set());
      await mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Aksi massal gagal");
    } finally {
      setBulkBusy(false);
    }
  }

  async function duplicate(id: number) {
    try {
      await apiFetch(`/admin/artikel/${id}/duplicate`, { method: "POST" });
      await mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menduplikat");
    }
  }

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
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Cari artikel…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
        />
        <select
          value={kategori}
          onChange={(e) => {
            setKategori(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500 shadow-sm"
        >
          <option value="">Semua kategori</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.nama}
            </option>
          ))}
        </select>
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
          <option value="scheduled">Terjadwal</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-emerald-800">{sel.size} dipilih</span>
          <span className="mx-1 h-4 w-px bg-emerald-200" />
          <BulkBtn disabled={bulkBusy} onClick={() => bulk("publish")}>
            Terbitkan
          </BulkBtn>
          <BulkBtn disabled={bulkBusy} onClick={() => bulk("draft")}>
            Jadikan draft
          </BulkBtn>
          <BulkBtn disabled={bulkBusy} onClick={() => bulk("feature")}>
            <Star size={13} /> Unggulkan
          </BulkBtn>
          <BulkBtn disabled={bulkBusy} onClick={() => bulk("unfeature")}>
            Batal unggulan
          </BulkBtn>
          <BulkBtn disabled={bulkBusy} danger onClick={() => bulk("delete")}>
            <Trash2 size={13} /> Hapus
          </BulkBtn>
          <button
            onClick={() => setSel(new Set())}
            className="ml-auto text-xs text-emerald-700 hover:underline"
          >
            Bersihkan
          </button>
        </div>
      )}

      {isLoading && <Spinner label="Memuat artikel…" />}
      {error && <ErrorBox message={(error as Error).message} />}

      {items.length === 0 && !isLoading ? (
        <div className="card p-10 text-center">
          <FileText size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Belum ada artikel.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Select-all header */}
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-3 sm:px-4 py-2 text-xs font-semibold text-slate-500">
            <button
              onClick={toggleAll}
              aria-label="Pilih semua"
              className="text-slate-400 hover:text-emerald-600"
            >
              {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <span>Pilih semua di halaman ini</span>
          </div>
          <div className="divide-y divide-slate-100">
            {items.map((a) => {
              const checked = sel.has(a.id);
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-3 p-3 sm:p-4 transition ${
                    checked ? "bg-emerald-50/50" : "hover:bg-slate-50/70"
                  }`}
                >
                  <button
                    onClick={() => toggle(a.id)}
                    aria-label="Pilih artikel"
                    className="text-slate-300 hover:text-emerald-600 shrink-0"
                  >
                    {checked ? (
                      <CheckSquare size={18} className="text-emerald-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                  <Link
                    href={`/admin/content/artikel/${a.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
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
                        {a.isFeatured && (
                          <span className="chip chip-gold inline-flex items-center gap-1">
                            <Star size={10} /> Unggulan
                          </span>
                        )}
                        <StatusBadge a={a} />
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
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => duplicate(a.id)}
                      title="Duplikat"
                      aria-label="Duplikat"
                      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:border-emerald-500 hover:text-emerald-700"
                    >
                      <Copy size={14} />
                    </button>
                    <Link
                      href={`/admin/content/artikel/${a.id}`}
                      title="Edit"
                      aria-label="Edit"
                      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:border-emerald-500 hover:text-emerald-700"
                    >
                      <Pencil size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
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

function BulkBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${
        danger
          ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
          : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100"
      }`}
    >
      {children}
    </button>
  );
}
