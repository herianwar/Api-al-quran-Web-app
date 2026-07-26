"use client";

import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CheckSquare,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileEdit,
  FileText,
  Heart,
  Grid3x3,
  Link2,
  List,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  Square,
  Star,
  StarOff,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  apiFetch,
  API_URL,
  fetcher,
  fetcherFull,
  type ApiResponse,
} from "@/lib/api";
import type {
  ArtikelAdminStats,
  ArtikelKategori,
  ArtikelListItem,
  ArtikelTag,
} from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";
import { ConfirmDialog, type ConfirmOptions } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { StatCard } from "@/components/admin/StatCard";

// ─── Helpers ───────────────────────────────────────────────────────────

function resolveImg(url?: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) {
    return `${API_URL.replace(/\/api\/v\d+\/?$/, "")}${url}`;
  }
  return url;
}

/** "12 Jul 2026" */
function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "12 Jul 2026, 09.30" — dipakai di tooltip & baris terjadwal. */
function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RTF = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 hari lalu" / "dalam 2 jam". Dihitung saat render (client-only data). */
function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = d.getTime() - Date.now();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return RTF.format(Math.round(diff / ms), unit);
  }
  return "baru saja";
}

function num(n?: number | null): string {
  return (n ?? 0).toLocaleString("id-ID");
}

const SORTS: { value: string; label: string }[] = [
  { value: "terbaru", label: "Terakhir diperbarui" },
  { value: "dibuat", label: "Terbaru dibuat" },
  { value: "terbit", label: "Terbaru terbit" },
  { value: "populer", label: "Paling banyak dibaca" },
  { value: "disukai", label: "Paling banyak disukai" },
  { value: "judul", label: "Judul A–Z" },
];

const LIMITS = [10, 20, 50, 100];

// ─── Page ──────────────────────────────────────────────────────────────

export default function AdminArtikelPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <AdminArtikelInner />
    </Suspense>
  );
}

function AdminArtikelInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // ── Filter state lives in the URL so refresh/back/share keep the view ──
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const kategori = sp.get("kategori") ?? "";
  const tag = sp.get("tag") ?? "";
  const sort = sp.get("sort") ?? "terbaru";
  const featured = sp.get("featured") === "1";
  const uncategorized = sp.get("uncategorized") === "1";
  const view = sp.get("view") === "grid" ? "grid" : "list";
  const limit = Number(sp.get("limit")) || 20;
  const page = Number(sp.get("page")) || 1;

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      // Any filter change invalidates the current page number.
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  // Search box: local state + debounce so we hit the API once per pause.
  const [qInput, setQInput] = useState(q);
  const [qSynced, setQSynced] = useState(q);
  const searchRef = useRef<HTMLInputElement | null>(null);
  // Reset dari luar (chip filter / "Reset semua") harus ikut mengosongkan
  // kotak pencarian — pola "adjust state during render" dari dokumentasi React.
  if (qSynced !== q) {
    setQSynced(q);
    setQInput(q);
  }
  useEffect(() => {
    const trimmed = qInput.trim();
    if (trimmed === q) return;
    const t = setTimeout(() => {
      setParams({ q: trimmed.length >= 2 ? trimmed : null });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, q, setParams]);

  // "/" memfokuskan kotak pencarian (kecuali sedang mengetik di input lain).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const listKey = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (kategori) p.set("kategori", kategori);
    if (tag) p.set("tag", tag);
    if (sort) p.set("sort", sort);
    if (featured) p.set("featured", "true");
    if (uncategorized) p.set("uncategorized", "true");
    return `/admin/artikel?${p.toString()}`;
  }, [page, limit, q, status, kategori, tag, sort, featured, uncategorized]);

  const { data, error, isLoading, mutate } = useSWR<
    ApiResponse<ArtikelListItem[]>
  >(listKey, (k: string) => fetcherFull<ArtikelListItem[]>(k), {
    keepPreviousData: true,
  });
  const { data: categories } = useSWR<ArtikelKategori[]>(
    "/admin/artikel/kategori",
    fetcher,
  );
  const { data: allTags } = useSWR<ArtikelTag[]>("/admin/artikel/tags", fetcher);
  const { data: stats, mutate: mutateStats } = useSWR<ArtikelAdminStats>(
    "/admin/artikel/stats",
    fetcher,
  );

  const items = useMemo(() => data?.data ?? [], [data]);
  const meta = data?.meta;
  const totalPages = (meta?.totalPages as number | undefined) ?? 1;
  const total = (meta?.total as number | undefined) ?? items.length;

  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "err" } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<
    (ConfirmOptions & { onConfirm: () => void }) | null
  >(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback(
    (msg: string, tone: "ok" | "err" = "ok") => setToast({ msg, tone }),
    [],
  );

  // Aksi massal hanya berlaku untuk artikel yang terlihat di halaman ini —
  // id dari halaman lain tetap tersimpan di `sel` (terpilih lagi saat kembali),
  // tapi tidak pernah ikut terhapus/terbit tanpa terlihat.
  const selIds = useMemo(
    () => items.filter((a) => sel.has(a.id)).map((a) => a.id),
    [items, sel],
  );

  const refresh = useCallback(
    () => Promise.all([mutate(), mutateStats()]),
    [mutate, mutateStats],
  );

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

  /** Partial PUT — dipakai tombol cepat (unggulan / terbit / draft). */
  async function patch(a: ArtikelListItem, body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await apiFetch(`/admin/artikel/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refresh();
      notify(msg);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal memperbarui", "err");
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(
    action: "publish" | "draft" | "feature" | "unfeature" | "category" | "delete",
    categoryId?: number | null,
  ) {
    if (selIds.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/admin/artikel/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selIds,
          action,
          ...(action === "category" ? { categoryId: categoryId ?? null } : {}),
        }),
      });
      const n = selIds.length;
      setSel(new Set());
      await refresh();
      notify(`${n} artikel diperbarui.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Aksi massal gagal", "err");
    } finally {
      setBusy(false);
    }
  }

  function askBulkDelete() {
    setConfirm({
      title: `Hapus ${selIds.length} artikel?`,
      message:
        "Artikel dan gambar yang tidak lagi dipakai akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.",
      confirmLabel: "Hapus permanen",
      tone: "danger",
      onConfirm: () => {
        setConfirm(null);
        void runBulk("delete");
      },
    });
  }

  function askDelete(a: ArtikelListItem) {
    setConfirm({
      title: "Hapus artikel ini?",
      message: `"${a.judul}" akan dihapus permanen beserta gambar yang tidak lagi terpakai.`,
      confirmLabel: "Hapus permanen",
      tone: "danger",
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        try {
          await apiFetch(`/admin/artikel/${a.id}`, { method: "DELETE" });
          await refresh();
          notify("Artikel dihapus.");
        } catch (e) {
          notify(e instanceof Error ? e.message : "Gagal menghapus", "err");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function duplicate(a: ArtikelListItem) {
    setBusy(true);
    try {
      await apiFetch(`/admin/artikel/${a.id}/duplicate`, { method: "POST" });
      await refresh();
      notify("Salinan draft dibuat.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menduplikat", "err");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(a: ArtikelListItem) {
    const url = `${window.location.origin}/artikel/${a.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Tautan disalin.");
    } catch {
      notify(url, "err");
    }
  }

  /** Unduh hasil filter saat ini sebagai CSV (maks 500 baris). */
  async function exportCsv() {
    setBusy(true);
    try {
      const key = listKey.replace(/([?&])page=\d+/, "$1page=1").replace(
        /([?&])limit=\d+/,
        "$1limit=500",
      );
      const res = await fetcherFull<ArtikelListItem[]>(key);
      const rows = res.data ?? [];
      const head = [
        "id",
        "judul",
        "slug",
        "status",
        "kategori",
        "penulis",
        "unggulan",
        "tanggal_terbit",
        "terjadwal",
        "dibuat",
        "diperbarui",
        "views",
        "likes",
        "menit_baca",
        "tags",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        head.join(","),
        ...rows.map((a) =>
          [
            a.id,
            a.judul,
            a.slug,
            a.status,
            a.category?.nama ?? "",
            a.penulis ?? "",
            a.isFeatured ? "ya" : "tidak",
            a.publishedAt ?? "",
            a.scheduledAt ?? "",
            a.createdAt ?? "",
            a.updatedAt ?? "",
            a.views,
            a.likeCount ?? 0,
            a.menitBaca,
            (a.tags ?? []).join(" | "),
          ]
            .map(esc)
            .join(","),
        ),
      ].join("\n");
      const blob = new Blob([`﻿${csv}`], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `artikel-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      notify(`${rows.length} baris diekspor.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ekspor gagal", "err");
    } finally {
      setBusy(false);
    }
  }

  const hasFilter =
    !!q || !!status || !!kategori || !!tag || featured || uncategorized;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Artikel"
        description={
          stats
            ? `${num(stats.total)} artikel · ${num(stats.published)} terbit · ${num(
                stats.draft,
              )} draft · ${num(stats.scheduled)} terjadwal`
            : "Kelola seluruh artikel portal."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onRefresh={refresh} />
            <button
              onClick={() => void exportCsv()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>
            <Link
              href="/admin/content/artikel/kategori"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Tag size={14} /> Kategori
            </Link>
            <Link
              href="/admin/content/artikel/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus size={14} /> Artikel baru
            </Link>
          </div>
        }
      />

      {/* Ringkasan angka */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total artikel"
          value={stats?.total ?? "—"}
          hint={`${num(stats?.publishedLast30)} terbit 30 hari terakhir`}
          icon={FileText}
          tone="emerald"
        />
        <StatCard
          label="Total dibaca"
          value={stats?.totalViews ?? "—"}
          hint="Akumulasi semua artikel"
          icon={Eye}
          tone="sky"
        />
        <StatCard
          label="Total disukai"
          value={stats?.totalLikes ?? "—"}
          hint="Like dari pengguna aplikasi"
          icon={Heart}
          tone="rose"
        />
        <StatCard
          label="Unggulan"
          value={stats?.featured ?? "—"}
          hint="Tampil di sorotan beranda"
          icon={Star}
          tone="amber"
        />
      </div>

      {/* Artikel terjadwal berikutnya */}
      {stats?.nextScheduled && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
          <CalendarClock size={16} className="shrink-0" />
          <span className="font-semibold">Terjadwal berikutnya:</span>
          <Link
            href={`/admin/content/artikel/${stats.nextScheduled.id}`}
            className="truncate font-medium hover:underline"
          >
            {stats.nextScheduled.judul}
          </Link>
          <span className="text-sky-600">
            · {fmtDateTime(stats.nextScheduled.scheduledAt)} (
            {timeAgo(stats.nextScheduled.scheduledAt)})
          </span>
        </div>
      )}

      {/* Filter status cepat */}
      <div className="flex flex-wrap gap-2">
        <FilterPill
          active={!status && !featured && !uncategorized}
          onClick={() =>
            setParams({ status: null, featured: null, uncategorized: null })
          }
          count={stats?.total}
        >
          Semua
        </FilterPill>
        <FilterPill
          active={status === "published"}
          onClick={() =>
            setParams({ status: "published", featured: null, uncategorized: null })
          }
          count={stats?.published}
          tone="emerald"
        >
          Terbit
        </FilterPill>
        <FilterPill
          active={status === "scheduled"}
          onClick={() =>
            setParams({ status: "scheduled", featured: null, uncategorized: null })
          }
          count={stats?.scheduled}
          tone="sky"
        >
          Terjadwal
        </FilterPill>
        <FilterPill
          active={status === "draft"}
          onClick={() =>
            setParams({ status: "draft", featured: null, uncategorized: null })
          }
          count={stats?.draft}
          tone="amber"
        >
          Draft
        </FilterPill>
        <FilterPill
          active={featured}
          onClick={() => setParams({ featured: featured ? null : "1" })}
          count={stats?.featured}
          tone="amber"
        >
          <Star size={12} /> Unggulan
        </FilterPill>
        <FilterPill
          active={uncategorized}
          onClick={() =>
            setParams({ uncategorized: uncategorized ? null : "1", kategori: null })
          }
          count={stats?.uncategorized}
          tone="slate"
        >
          Tanpa kategori
        </FilterPill>
      </div>

      {/* Toolbar */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Cari judul, ringkasan, atau tag…  (tekan / )"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            {qInput && (
              <button
                onClick={() => setQInput("")}
                aria-label="Bersihkan pencarian"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <Select
            value={kategori}
            onChange={(v) => setParams({ kategori: v, uncategorized: null })}
            aria-label="Filter kategori"
          >
            <option value="">Semua kategori</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.nama} ({c.jumlahArtikel ?? 0})
              </option>
            ))}
          </Select>
          <Select
            value={tag}
            onChange={(v) => setParams({ tag: v })}
            aria-label="Filter tag"
          >
            <option value="">Semua tag</option>
            {allTags?.slice(0, 60).map((t) => (
              <option key={t.tag} value={t.tag}>
                #{t.tag} ({t.count})
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(v) => setParams({ sort: v === "terbaru" ? null : v })}
            aria-label="Urutkan"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <ViewBtn
              active={view === "list"}
              onClick={() => setParams({ view: null, page: String(page) })}
              label="Tampilan daftar"
            >
              <List size={16} />
            </ViewBtn>
            <ViewBtn
              active={view === "grid"}
              onClick={() => setParams({ view: "grid", page: String(page) })}
              label="Tampilan kartu"
            >
              <Grid3x3 size={16} />
            </ViewBtn>
          </div>
        </div>

        {/* Chip filter aktif */}
        {hasFilter && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="text-xs font-semibold text-slate-500">Filter:</span>
            {q && <ActiveChip onClear={() => setParams({ q: null })}>“{q}”</ActiveChip>}
            {status && (
              <ActiveChip onClear={() => setParams({ status: null })}>
                Status: {status}
              </ActiveChip>
            )}
            {kategori && (
              <ActiveChip onClear={() => setParams({ kategori: null })}>
                Kategori:{" "}
                {categories?.find((c) => c.slug === kategori)?.nama ?? kategori}
              </ActiveChip>
            )}
            {tag && (
              <ActiveChip onClear={() => setParams({ tag: null })}>#{tag}</ActiveChip>
            )}
            {featured && (
              <ActiveChip onClear={() => setParams({ featured: null })}>
                Unggulan
              </ActiveChip>
            )}
            {uncategorized && (
              <ActiveChip onClear={() => setParams({ uncategorized: null })}>
                Tanpa kategori
              </ActiveChip>
            )}
            <button
              onClick={() =>
                setParams({
                  q: null,
                  status: null,
                  kategori: null,
                  tag: null,
                  featured: null,
                  uncategorized: null,
                })
              }
              className="ml-1 text-xs font-semibold text-emerald-700 hover:underline"
            >
              Reset semua
            </button>
          </div>
        )}
      </div>

      {error && <ErrorBox message={(error as Error).message} />}

      {/* Hasil */}
      {isLoading && !data ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={hasFilter ? "Tidak ada artikel yang cocok" : "Belum ada artikel"}
          description={
            hasFilter
              ? "Coba ubah kata kunci atau bersihkan filter yang aktif."
              : "Mulai tulis artikel pertama untuk portal Rumah Qur'an."
          }
          action={
            hasFilter ? (
              <button
                onClick={() =>
                  setParams({
                    q: null,
                    status: null,
                    kategori: null,
                    tag: null,
                    featured: null,
                    uncategorized: null,
                  })
                }
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Bersihkan filter
              </button>
            ) : (
              <Link
                href="/admin/content/artikel/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Plus size={14} /> Artikel baru
              </Link>
            )
          }
        />
      ) : view === "grid" ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((a) => (
            <ArtikelCard
              key={a.id}
              a={a}
              checked={sel.has(a.id)}
              busy={busy}
              onToggle={() => toggle(a.id)}
              onFeature={() =>
                void patch(
                  a,
                  { isFeatured: !a.isFeatured },
                  a.isFeatured ? "Dilepas dari unggulan." : "Dijadikan unggulan.",
                )
              }
              onPublish={() =>
                void patch(
                  a,
                  { status: a.status === "published" ? "draft" : "published" },
                  a.status === "published" ? "Dikembalikan ke draft." : "Artikel terbit.",
                )
              }
              onDuplicate={() => void duplicate(a)}
              onCopyLink={() => void copyLink(a)}
              onDelete={() => askDelete(a)}
            />
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-500 sm:px-4">
            <button
              onClick={toggleAll}
              aria-label="Pilih semua di halaman ini"
              className="text-slate-400 hover:text-emerald-600"
            >
              {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <span>Pilih semua di halaman ini</span>
            <span className="ml-auto tabular-nums">
              {from}–{to} dari {num(total)}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {items.map((a) => (
              <ArtikelRow
                key={a.id}
                a={a}
                checked={sel.has(a.id)}
                busy={busy}
                onToggle={() => toggle(a.id)}
                onFeature={() =>
                  void patch(
                    a,
                    { isFeatured: !a.isFeatured },
                    a.isFeatured ? "Dilepas dari unggulan." : "Dijadikan unggulan.",
                  )
                }
                onPublish={() =>
                  void patch(
                    a,
                    { status: a.status === "published" ? "draft" : "published" },
                    a.status === "published"
                      ? "Dikembalikan ke draft."
                      : "Artikel terbit.",
                  )
                }
                onDuplicate={() => void duplicate(a)}
                onCopyLink={() => void copyLink(a)}
                onDelete={() => askDelete(a)}
                onTag={(t) => setParams({ tag: t })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="tabular-nums">
              {from}–{to} dari {num(total)}
            </span>
            <Select
              value={String(limit)}
              onChange={(v) => setParams({ limit: v === "20" ? null : v })}
              aria-label="Jumlah per halaman"
              compact
            >
              {LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n} / halaman
                </option>
              ))}
            </Select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <PageBtn
                disabled={page <= 1}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                ← Sebelumnya
              </PageBtn>
              <span className="text-sm text-slate-500 tabular-nums">
                Hal {page} / {totalPages}
              </span>
              <PageBtn
                disabled={page >= totalPages}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Selanjutnya →
              </PageBtn>
            </div>
          )}
        </div>
      )}

      {/* Artikel terpopuler */}
      {stats && stats.topViewed.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={15} className="text-emerald-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Artikel terpopuler
            </h2>
          </div>
          <ol className="space-y-2">
            {stats.topViewed.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 shrink-0 text-center font-bold text-slate-300 tabular-nums">
                  {i + 1}
                </span>
                <Link
                  href={`/admin/content/artikel/${t.id}`}
                  className="min-w-0 flex-1 truncate font-medium text-slate-700 hover:text-emerald-700"
                >
                  {t.judul}
                </Link>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500 tabular-nums">
                  <Eye size={12} /> {num(t.views)}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500 tabular-nums">
                  <Heart size={12} /> {num(t.likeCount)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Bulk bar (sticky) */}
      {selIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto w-[calc(100%-2rem)] max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
            <span className="text-sm font-semibold text-emerald-800">
              {selIds.length} dipilih
            </span>
            <span className="mx-1 h-4 w-px bg-emerald-200" />
            <BulkBtn disabled={busy} onClick={() => void runBulk("publish")}>
              <Send size={13} /> Terbitkan
            </BulkBtn>
            <BulkBtn disabled={busy} onClick={() => void runBulk("draft")}>
              <FileEdit size={13} /> Draft
            </BulkBtn>
            <BulkBtn disabled={busy} onClick={() => void runBulk("feature")}>
              <Star size={13} /> Unggulkan
            </BulkBtn>
            <BulkBtn disabled={busy} onClick={() => void runBulk("unfeature")}>
              <StarOff size={13} /> Batal unggulan
            </BulkBtn>
            <select
              disabled={busy}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                void runBulk("category", v === "none" ? null : Number(v));
                e.target.value = "";
              }}
              className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 outline-none"
            >
              <option value="">Pindah kategori…</option>
              <option value="none">— Tanpa kategori —</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>
            <BulkBtn disabled={busy} danger onClick={askBulkDelete}>
              <Trash2 size={13} /> Hapus
            </BulkBtn>
            <button
              onClick={() => setSel(new Set())}
              className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Bersihkan
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.tone === "ok"
              ? "bg-slate-900 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ─── Row / card ────────────────────────────────────────────────────────

interface ItemProps {
  a: ArtikelListItem;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onFeature: () => void;
  onPublish: () => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onTag?: (tag: string) => void;
}

function ArtikelRow({
  a,
  checked,
  busy,
  onToggle,
  onFeature,
  onPublish,
  onDuplicate,
  onCopyLink,
  onDelete,
  onTag,
}: ItemProps) {
  return (
    <div
      className={`flex items-start gap-3 p-3 transition sm:p-4 ${
        checked ? "bg-emerald-50/60" : "hover:bg-slate-50/70"
      }`}
    >
      <button
        onClick={onToggle}
        aria-label="Pilih artikel"
        className="mt-6 shrink-0 text-slate-300 hover:text-emerald-600"
      >
        {checked ? (
          <CheckSquare size={18} className="text-emerald-600" />
        ) : (
          <Square size={18} />
        )}
      </button>

      <Link
        href={`/admin/content/artikel/${a.id}`}
        className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-20 sm:w-20"
      >
        {a.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImg(a.coverUrl)}
            alt={a.coverAlt || a.judul}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-slate-300">
            <FileText size={22} />
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Link
            href={`/admin/content/artikel/${a.id}`}
            className="truncate text-sm font-semibold text-slate-900 hover:text-emerald-700"
          >
            {a.judul}
          </Link>
          {a.isFeatured && (
            <span className="chip chip-gold inline-flex items-center gap-1">
              <Star size={10} /> Unggulan
            </span>
          )}
          <StatusBadge a={a} />
        </div>

        <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span className="font-medium text-slate-600">
            {a.category?.nama ?? "Tanpa kategori"}
          </span>
          <span>·</span>
          <span>{a.penulis || "Tanpa penulis"}</span>
          <span>·</span>
          <span>{a.menitBaca} mnt baca</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Eye size={11} /> {num(a.views)}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Heart size={11} /> {num(a.likeCount)}
          </span>
        </p>

        <DateLine a={a} />

        {a.tags && a.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {a.tags.slice(0, 5).map((t) => (
              <button
                key={t}
                onClick={() => onTag?.(t)}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
              >
                #{t}
              </button>
            ))}
            {a.tags.length > 5 && (
              <span className="px-1 text-[11px] text-slate-400">
                +{a.tags.length - 5}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconBtn
          onClick={onFeature}
          disabled={busy}
          title={a.isFeatured ? "Batal unggulan" : "Jadikan unggulan"}
          active={a.isFeatured}
        >
          <Star size={14} className={a.isFeatured ? "fill-amber-400" : ""} />
        </IconBtn>
        <IconBtn
          href={`/admin/content/artikel/${a.id}`}
          title="Edit artikel"
        >
          <Pencil size={14} />
        </IconBtn>
        <RowMenu
          a={a}
          busy={busy}
          onPublish={onPublish}
          onDuplicate={onDuplicate}
          onCopyLink={onCopyLink}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function ArtikelCard({
  a,
  checked,
  busy,
  onToggle,
  onFeature,
  onPublish,
  onDuplicate,
  onCopyLink,
  onDelete,
}: ItemProps) {
  return (
    <div
      className={`card flex flex-col overflow-visible transition ${
        checked ? "ring-2 ring-emerald-500" : ""
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-slate-100">
        {a.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImg(a.coverUrl)}
            alt={a.coverAlt || a.judul}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-slate-300">
            <FileText size={32} />
          </div>
        )}
        <button
          onClick={onToggle}
          aria-label="Pilih artikel"
          className="absolute left-2 top-2 rounded-md bg-white/90 p-1 text-slate-400 shadow-sm hover:text-emerald-600"
        >
          {checked ? (
            <CheckSquare size={16} className="text-emerald-600" />
          ) : (
            <Square size={16} />
          )}
        </button>
        <div className="absolute right-2 top-2 flex gap-1">
          <StatusBadge a={a} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start gap-1.5">
          <Link
            href={`/admin/content/artikel/${a.id}`}
            className="line-clamp-2 flex-1 text-sm font-semibold text-slate-900 hover:text-emerald-700"
          >
            {a.judul}
          </Link>
          {a.isFeatured && (
            <Star size={14} className="mt-0.5 shrink-0 fill-amber-400 text-amber-500" />
          )}
        </div>
        <p className="text-xs text-slate-500">
          {a.category?.nama ?? "Tanpa kategori"} · {a.penulis || "Tanpa penulis"}
        </p>
        <DateLine a={a} />
        {/* div, bukan <p>: RowMenu di dalamnya merender <div> (invalid di <p>). */}
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-slate-500 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Eye size={12} /> {num(a.views)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart size={12} /> {num(a.likeCount)}
          </span>
          <span>{a.menitBaca} mnt</span>
          <span className="ml-auto flex items-center gap-1">
            <IconBtn
              onClick={onFeature}
              disabled={busy}
              title={a.isFeatured ? "Batal unggulan" : "Jadikan unggulan"}
              active={a.isFeatured}
            >
              <Star size={14} className={a.isFeatured ? "fill-amber-400" : ""} />
            </IconBtn>
            <IconBtn href={`/admin/content/artikel/${a.id}`} title="Edit artikel">
              <Pencil size={14} />
            </IconBtn>
            <RowMenu
              a={a}
              busy={busy}
              onPublish={onPublish}
              onDuplicate={onDuplicate}
              onCopyLink={onCopyLink}
              onDelete={onDelete}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Baris tanggal — inti dari "kapan artikel ini tayang". */
function DateLine({ a }: { a: ArtikelListItem }) {
  if (a.status === "scheduled" && a.scheduledAt) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-sky-700">
        <span
          className="inline-flex items-center gap-1"
          title={fmtDateTime(a.scheduledAt)}
        >
          <CalendarClock size={11} /> Terbit {fmtDateTime(a.scheduledAt)}
        </span>
        <span className="text-sky-500">({timeAgo(a.scheduledAt)})</span>
      </p>
    );
  }
  if (a.status === "published" && a.publishedAt) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
        <span
          className="inline-flex items-center gap-1 text-slate-500"
          title={fmtDateTime(a.publishedAt)}
        >
          <CalendarCheck size={11} /> Terbit {fmtDate(a.publishedAt)}
        </span>
        <span>({timeAgo(a.publishedAt)})</span>
        {a.updatedAt && (
          <span title={fmtDateTime(a.updatedAt)}>
            · Diperbarui {timeAgo(a.updatedAt)}
          </span>
        )}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
      <span
        className="inline-flex items-center gap-1 text-slate-500"
        title={fmtDateTime(a.createdAt)}
      >
        <FileEdit size={11} /> Dibuat {fmtDate(a.createdAt)}
      </span>
      {a.updatedAt && (
        <span title={fmtDateTime(a.updatedAt)}>
          · Diperbarui {timeAgo(a.updatedAt)}
        </span>
      )}
    </p>
  );
}

function StatusBadge({ a }: { a: ArtikelListItem }) {
  if (a.status === "published")
    return (
      <span className="chip inline-flex items-center gap-1">
        <CalendarCheck size={11} /> Terbit
      </span>
    );
  if (a.status === "scheduled")
    return (
      <span className="chip inline-flex items-center gap-1 !bg-sky-100 !text-sky-700">
        <CalendarClock size={11} /> Terjadwal
      </span>
    );
  return (
    <span className="chip inline-flex items-center gap-1 !bg-amber-100 !text-amber-700">
      <FileEdit size={11} /> Draft
    </span>
  );
}

/** Menu aksi tambahan per artikel (lihat publik, salin tautan, duplikat, …). */
function RowMenu({
  a,
  busy,
  onPublish,
  onDuplicate,
  onCopyLink,
  onDelete,
}: {
  a: ArtikelListItem;
  busy: boolean;
  onPublish: () => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Aksi lain"
        aria-expanded={open}
        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:border-emerald-500 hover:text-emerald-700"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            <MenuItem
              icon={a.status === "published" ? FileEdit : Send}
              onClick={() => {
                close();
                onPublish();
              }}
              disabled={busy}
            >
              {a.status === "published" ? "Kembalikan ke draft" : "Terbitkan sekarang"}
            </MenuItem>
            <MenuItem
              icon={ExternalLink}
              href={`/artikel/${a.slug}`}
              external
              onClick={close}
            >
              Lihat di situs
            </MenuItem>
            <MenuItem
              icon={Eye}
              href={`/admin/content/artikel/${a.id}/preview`}
              external
              onClick={close}
            >
              Pratinjau
            </MenuItem>
            <MenuItem
              icon={Link2}
              onClick={() => {
                close();
                onCopyLink();
              }}
            >
              Salin tautan publik
            </MenuItem>
            <MenuItem
              icon={Copy}
              onClick={() => {
                close();
                onDuplicate();
              }}
              disabled={busy}
            >
              Duplikat sebagai draft
            </MenuItem>
            <div className="my-1 h-px bg-slate-100" />
            <MenuItem
              icon={Trash2}
              danger
              onClick={() => {
                close();
                onDelete();
              }}
              disabled={busy}
            >
              Hapus artikel
            </MenuItem>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  href,
  external,
  danger,
  disabled,
}: {
  icon: typeof Eye;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const cls = `flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
    danger
      ? "text-rose-600 hover:bg-rose-50"
      : "text-slate-700 hover:bg-slate-50"
  } disabled:opacity-40`;
  if (href) {
    return (
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        onClick={onClick}
        className={cls}
      >
        <Icon size={14} /> {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      <Icon size={14} /> {children}
    </button>
  );
}

// ─── Small UI atoms ────────────────────────────────────────────────────

function IconBtn({
  children,
  onClick,
  href,
  title,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  title: string;
  disabled?: boolean;
  active?: boolean;
}) {
  const cls = `rounded-lg border p-2 transition disabled:opacity-40 ${
    active
      ? "border-amber-300 bg-amber-50 text-amber-600"
      : "border-slate-200 bg-white text-slate-500 hover:border-emerald-500 hover:text-emerald-700"
  }`;
  if (href) {
    return (
      <Link href={href} title={title} aria-label={title} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cls}
    >
      {children}
    </button>
  );
}

function FilterPill({
  children,
  active,
  onClick,
  count,
  tone = "emerald",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  tone?: "emerald" | "amber" | "sky" | "slate";
}) {
  const activeCls: Record<string, string> = {
    emerald: "border-emerald-500 bg-emerald-50 text-emerald-700",
    amber: "border-amber-400 bg-amber-50 text-amber-700",
    sky: "border-sky-400 bg-sky-50 text-sky-700",
    slate: "border-slate-400 bg-slate-100 text-slate-700",
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-sm transition ${
        active
          ? activeCls[tone]
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
      {typeof count === "number" && (
        <span className="tabular-nums opacity-70">{num(count)}</span>
      )}
    </button>
  );
}

function ActiveChip({
  children,
  onClear,
}: {
  children: React.ReactNode;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
      {children}
      <button onClick={onClear} aria-label="Hapus filter" className="hover:text-emerald-900">
        <X size={12} />
      </button>
    </span>
  );
}

function Select({
  value,
  onChange,
  children,
  compact,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  compact?: boolean;
  "aria-label"?: string;
}) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-xl border border-slate-200 bg-white text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500 ${
        compact ? "px-2 py-1 text-xs" : "px-3 py-2.5"
      }`}
    >
      {children}
    </select>
  );
}

function ViewBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`rounded-lg p-2 transition ${
        active
          ? "bg-emerald-600 text-white"
          : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function PageBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
    >
      {children}
    </button>
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
          : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
      }`}
    >
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="card divide-y divide-slate-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton width={18} height={18} rounded="sm" />
          <Skeleton width={80} height={80} rounded="lg" />
          <div className="flex-1 space-y-2">
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={11} />
            <Skeleton width="45%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}
