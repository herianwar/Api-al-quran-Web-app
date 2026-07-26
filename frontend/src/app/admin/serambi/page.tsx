"use client";

import {
  Archive,
  ArchiveRestore,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CheckSquare,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileEdit,
  Grid3x3,
  Heart,
  ImagePlus,
  Link2,
  List,
  MessageCircle,
  MessageSquareQuote,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import {
  API_URL,
  apiFetch,
  fetcher,
  fetcherFull,
  tokenStore,
  type ApiResponse,
} from "@/lib/api";
import type {
  SerambiAdminStats,
  SerambiAuthor,
  SerambiPost,
  SerambiStatus,
} from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";
import { ConfirmDialog, type ConfirmOptions } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { StatCard } from "@/components/admin/StatCard";

// ─── Helpers ───────────────────────────────────────────────────────────

/** Origin backend tanpa suffix /api/vN — untuk menjadikan URL relatif absolut. */
const ORIGIN = API_URL.replace(/\/api\/v\d+\/?$/, "");

function resolveImg(url?: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `${ORIGIN}${url}`;
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

/** Potong isi post jadi satu baris ringkas (untuk judul dialog / stats). */
function excerpt(body: string, max = 70): string {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max).trimEnd()}…` : one;
}

// ─── Kalender WIB ──────────────────────────────────────────────────────
// Antrean tayang selalu dikelompokkan menurut hari WIB, bukan zona browser
// admin — supaya "Hari ini" di panel sama persis dengan yang dihitung backend
// (slot 05:30 WIB tersimpan sebagai 22:30 UTC hari sebelumnya).

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "YYYY-MM-DD" tanggal WIB dari sebuah instant ISO. */
function wibDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** "05:30" jam WIB dari sebuah instant ISO. */
function wibTime(iso: string): string {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_MS)
    .toISOString()
    .slice(11, 16);
}

/** "YYYY-MM-DD" hari WIB ke-`offsetDays` dari sekarang. */
function wibTodayKey(offsetDays = 0): string {
  const n = new Date(Date.now() + WIB_OFFSET_MS);
  return new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offsetDays),
  )
    .toISOString()
    .slice(0, 10);
}

/** "Hari ini" / "Besok" / "Rabu, 29 Jul" untuk judul grup antrean. */
function wibDayLabel(key: string): string {
  if (key === wibTodayKey(0)) return "Hari ini";
  if (key === wibTodayKey(1)) return "Besok";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** ISO → nilai <input type="datetime-local"> ("YYYY-MM-DDTHH:mm") di zona lokal. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const STATUS_META: Record<
  string,
  { label: string; chip: string; icon: typeof Eye }
> = {
  draft: {
    label: "Draft",
    chip: "!bg-amber-100 !text-amber-700",
    icon: FileEdit,
  },
  scheduled: {
    label: "Terjadwal",
    chip: "!bg-sky-100 !text-sky-700",
    icon: CalendarClock,
  },
  published: {
    label: "Terbit",
    chip: "!bg-emerald-100 !text-emerald-700",
    icon: CalendarCheck,
  },
  archived: {
    label: "Arsip",
    chip: "!bg-slate-200 !text-slate-600",
    icon: Archive,
  },
};

const SORTS: { value: string; label: string }[] = [
  { value: "jadwal", label: "Jadwal terdekat" },
  { value: "terbaru", label: "Terbaru dibuat" },
  { value: "diperbarui", label: "Terakhir diperbarui" },
  { value: "disukai", label: "Paling banyak disukai" },
  { value: "dikomentari", label: "Paling banyak dikomentari" },
  { value: "terlama", label: "Terlama" },
];

const LIMITS = [10, 20, 50, 100];

// ─── Page ──────────────────────────────────────────────────────────────

export default function AdminSerambiPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <AdminSerambiInner />
    </Suspense>
  );
}

function AdminSerambiInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // ── Filter state hidup di URL supaya refresh/back/share tetap sama ──
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const author = sp.get("author") ?? "";
  const sort = sp.get("sort") ?? "terbaru";
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
      // Setiap perubahan filter membatalkan nomor halaman saat ini.
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  // Kotak pencarian: state lokal + debounce → satu request per jeda ketik.
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
      const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
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
    if (author) p.set("authorId", author);
    if (sort) p.set("sort", sort);
    return `/admin/serambi/posts?${p.toString()}`;
  }, [page, limit, q, status, author, sort]);

  const { data, error, isLoading, mutate } = useSWR<ApiResponse<SerambiPost[]>>(
    listKey,
    (k: string) => fetcherFull<SerambiPost[]>(k),
    { keepPreviousData: true },
  );
  const { data: stats, mutate: mutateStats } = useSWR<SerambiAdminStats>(
    "/admin/serambi/stats",
    fetcher,
  );

  const items = useMemo(() => data?.data ?? [], [data]);

  // Antrean tayang dikelompokkan per hari WIB. `upcoming` sudah urut menaik
  // dari backend, jadi cukup pecah saat tanggalnya berganti.
  const upcomingByDay = useMemo(() => {
    const groups: {
      key: string;
      items: NonNullable<SerambiAdminStats["upcoming"]>;
    }[] = [];
    for (const u of stats?.upcoming ?? []) {
      if (!u.scheduledAt) continue;
      const key = wibDayKey(u.scheduledAt);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(u);
      else groups.push({ key, items: [u] });
    }
    return groups;
  }, [stats]);

  // "Jadwal terdekat" hanya masuk akal untuk post terjadwal; pindah ke tab
  // status lain mengembalikan urutan ke default.
  const dropJadwalSort: Record<string, string | null> =
    sort === "jadwal" ? { sort: null } : {};

  const meta = data?.meta;
  const totalPages = (meta?.totalPages as number | undefined) ?? 1;
  const total = (meta?.total as number | undefined) ?? items.length;

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SerambiPost | "new" | null>(null);
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

  // Aksi massal hanya berlaku untuk post yang terlihat di halaman ini — id
  // dari halaman lain tetap tersimpan di `sel` (terpilih lagi saat kembali),
  // tapi tidak pernah ikut terhapus/terbit tanpa terlihat.
  const selIds = useMemo(
    () => items.filter((p) => sel.has(p.id)).map((p) => p.id),
    [items, sel],
  );

  const refresh = useCallback(
    () => Promise.all([mutate(), mutateStats()]),
    [mutate, mutateStats],
  );

  const allSelected = items.length > 0 && items.every((p) => sel.has(p.id));

  function toggle(id: string) {
    setSel((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSel(() => (allSelected ? new Set() : new Set(items.map((p) => p.id))));
  }

  /** PATCH parsial — dipakai tombol cepat (terbit / draft / arsip). */
  async function patch(
    p: SerambiPost,
    body: Record<string, unknown>,
    msg: string,
  ) {
    setBusy(true);
    try {
      await apiFetch(`/admin/serambi/posts/${p.id}`, {
        method: "PATCH",
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
    action: "publish" | "draft" | "archive" | "author" | "delete",
    authorId?: string,
  ) {
    if (selIds.length === 0) return;
    setBusy(true);
    try {
      await apiFetch("/admin/serambi/posts/bulk", {
        method: "POST",
        body: JSON.stringify({
          ids: selIds,
          action,
          ...(action === "author" ? { authorId } : {}),
        }),
      });
      const n = selIds.length;
      setSel(new Set());
      await refresh();
      notify(`${n} post diperbarui.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Aksi massal gagal", "err");
    } finally {
      setBusy(false);
    }
  }

  function askBulkDelete() {
    setConfirm({
      title: `Hapus ${selIds.length} post?`,
      message:
        "Post beserta seluruh like & komentarnya akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.",
      confirmLabel: "Hapus permanen",
      tone: "danger",
      onConfirm: () => {
        setConfirm(null);
        void runBulk("delete");
      },
    });
  }

  function askDelete(p: SerambiPost) {
    setConfirm({
      title: "Hapus post ini?",
      message: `"${excerpt(p.body, 90)}" akan dihapus permanen beserta ${num(
        p.likeCount,
      )} suka dan ${num(p.commentCount)} komentar.`,
      confirmLabel: "Hapus permanen",
      tone: "danger",
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        try {
          await apiFetch(`/admin/serambi/posts/${p.id}`, { method: "DELETE" });
          await refresh();
          notify("Post dihapus.");
        } catch (e) {
          notify(e instanceof Error ? e.message : "Gagal menghapus", "err");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function duplicate(p: SerambiPost) {
    setBusy(true);
    try {
      await apiFetch(`/admin/serambi/posts/${p.id}/duplicate`, {
        method: "POST",
      });
      await refresh();
      notify("Salinan draft dibuat.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal menduplikat", "err");
    } finally {
      setBusy(false);
    }
  }

  async function copyBody(p: SerambiPost) {
    try {
      await navigator.clipboard.writeText(p.body);
      notify("Isi post disalin.");
    } catch {
      notify("Gagal menyalin isi post", "err");
    }
  }

  /** Unduh hasil filter saat ini sebagai CSV (maks 500 baris). */
  async function exportCsv() {
    setBusy(true);
    try {
      const key = listKey
        .replace(/([?&])page=\d+/, "$1page=1")
        .replace(/([?&])limit=\d+/, "$1limit=500");
      const res = await fetcherFull<SerambiPost[]>(key);
      const rows = res.data ?? [];
      const head = [
        "id",
        "isi",
        "penulis",
        "status",
        "terjadwal",
        "suka",
        "komentar",
        "gambar",
        "dibuat",
        "diperbarui",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        head.join(","),
        ...rows.map((p) =>
          [
            p.id,
            p.body,
            p.authorName,
            p.status,
            p.scheduledAt ?? "",
            p.likeCount,
            p.commentCount,
            p.imageUrl ?? "",
            p.createdAt,
            p.updatedAt,
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
      link.download = `serambi-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      notify(`${rows.length} baris diekspor.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ekspor gagal", "err");
    } finally {
      setBusy(false);
    }
  }

  const hasFilter = !!q || !!status || !!author;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const authorLabel =
    author === "none"
      ? "Tanpa master penulis"
      : (stats?.byAuthor.find((a) => a.id === author)?.name ?? author);

  const rowProps = (p: SerambiPost) => ({
    p,
    checked: sel.has(p.id),
    busy,
    onToggle: () => toggle(p.id),
    onEdit: () => setEditing(p),
    onPublish: () =>
      void patch(
        p,
        { status: p.status === "published" ? "draft" : "published" },
        p.status === "published" ? "Dikembalikan ke draft." : "Post terbit.",
      ),
    onArchive: () =>
      void patch(
        p,
        { status: p.status === "archived" ? "draft" : "archived" },
        p.status === "archived" ? "Dipulihkan ke draft." : "Post diarsipkan.",
      ),
    onDuplicate: () => void duplicate(p),
    onCopy: () => void copyBody(p),
    onDelete: () => askDelete(p),
  });

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Serambi"
        description={
          stats
            ? `${num(stats.total)} post · ${num(stats.published)} terbit · ${num(
                stats.draft,
              )} draft · ${num(stats.scheduled)} terjadwal`
            : "Kutipan & renungan singkat untuk feed Serambi di app."
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
              href="/admin/serambi/authors"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Users size={14} /> Penulis
            </Link>
            <Link
              href="/admin/serambi/comments"
              className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <MessageCircle size={14} /> Komentar
              {!!stats?.comments.hidden && (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                  {num(stats.comments.hidden)}
                </span>
              )}
            </Link>
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus size={14} /> Post baru
            </button>
          </div>
        }
      />

      {/* Ringkasan angka */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total post"
          value={stats?.total ?? "—"}
          hint={`${num(stats?.publishedLast30)} terbit 30 hari terakhir`}
          icon={MessageSquareQuote}
          tone="emerald"
        />
        <StatCard
          label="Total disukai"
          value={stats?.totalLikes ?? "—"}
          hint="Like dari pengguna aplikasi"
          icon={Heart}
          tone="rose"
        />
        <StatCard
          label="Total komentar"
          value={stats?.totalComments ?? "—"}
          hint={
            stats?.comments.hidden
              ? `${num(stats.comments.hidden)} disembunyikan`
              : "Semua komentar tampil"
          }
          icon={MessageCircle}
          tone="sky"
        />
        <StatCard
          label="Terjadwal"
          value={stats?.scheduled ?? "—"}
          hint={
            stats
              ? stats.jadwal.hariIni > 0
                ? `${num(stats.jadwal.hariIni)} tayang hari ini · ${num(
                    stats.jadwal.besok,
                  )} besok`
                : stats.nextScheduled
                  ? `Berikutnya ${timeAgo(stats.nextScheduled.scheduledAt)}`
                  : "Tidak ada antrean tayang"
              : "—"
          }
          icon={CalendarClock}
          tone="amber"
        />
      </div>

      {/* Antrean tayang — apa yang naik hari ini, besok, dan seterusnya */}
      {stats && stats.scheduled > 0 && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <CalendarClock size={16} className="text-sky-500" />
              Akan tayang
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <CountChip
                label="Hari ini"
                value={stats.jadwal.hariIni}
                tone="sky"
              />
              <CountChip label="Besok" value={stats.jadwal.besok} tone="slate" />
              <CountChip
                label="7 hari"
                value={stats.jadwal.tujuhHari}
                tone="slate"
              />
              <CountChip
                label="Total antre"
                value={stats.scheduled}
                tone="slate"
              />
            </div>
            <button
              onClick={() => setParams({ status: "scheduled", sort: "jadwal" })}
              className="ml-auto text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              Lihat semua jadwal →
            </button>
          </div>

          {stats.jadwal.terlambat > 0 && (
            <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
              <CalendarCheck size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong>{num(stats.jadwal.terlambat)} post</strong> sudah lewat
                jadwalnya tapi belum tayang. Promosi dipicu kunjungan ke feed
                publik, jadi biasanya beres sendiri dalam beberapa menit.
              </span>
            </div>
          )}

          {upcomingByDay.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">
              Belum ada antrean tayang.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingByDay.map((g) => (
                <div key={g.key} className="px-4 py-3">
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {wibDayLabel(g.key)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {g.items.length} post
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {g.items.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <span className="mt-px w-12 shrink-0 font-mono text-xs font-semibold tabular-nums text-sky-600">
                          {u.scheduledAt ? wibTime(u.scheduledAt) : "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-600">
                          {excerpt(u.body, 90)}
                        </span>
                        <span
                          className="hidden shrink-0 text-xs text-slate-400 sm:inline"
                          title={fmtDateTime(u.scheduledAt)}
                        >
                          {timeAgo(u.scheduledAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
            Semua jam ditampilkan dalam WIB (UTC+7).
          </p>
        </div>
      )}

      {/* Filter status cepat */}
      <div className="flex flex-wrap gap-2">
        <FilterPill
          active={!status && !author}
          onClick={() =>
            setParams({ status: null, author: null, ...dropJadwalSort })
          }
          count={stats?.total}
        >
          Semua
        </FilterPill>
        <FilterPill
          active={status === "published"}
          onClick={() => setParams({ status: "published", ...dropJadwalSort })}
          count={stats?.published}
          tone="emerald"
        >
          Terbit
        </FilterPill>
        <FilterPill
          active={status === "scheduled"}
          // Masuk ke tab terjadwal = ingin lihat antrean, jadi sekalian urut
          // dari yang paling dekat tayang.
          onClick={() => setParams({ status: "scheduled", sort: "jadwal" })}
          count={stats?.scheduled}
          tone="sky"
        >
          Terjadwal
        </FilterPill>
        <FilterPill
          active={status === "draft"}
          onClick={() => setParams({ status: "draft", ...dropJadwalSort })}
          count={stats?.draft}
          tone="amber"
        >
          Draft
        </FilterPill>
        <FilterPill
          active={status === "archived"}
          onClick={() => setParams({ status: "archived", ...dropJadwalSort })}
          count={stats?.archived}
          tone="slate"
        >
          Arsip
        </FilterPill>
        <FilterPill
          active={author === "none"}
          onClick={() => setParams({ author: author === "none" ? null : "none" })}
          count={stats?.manualAuthor}
          tone="slate"
        >
          Penulis manual
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
              placeholder="Cari isi post atau nama penulis…  (tekan / )"
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
            value={author}
            onChange={(v) => setParams({ author: v })}
            aria-label="Filter penulis"
          >
            <option value="">Semua penulis</option>
            <option value="none">
              Tanpa master penulis ({num(stats?.manualAuthor)})
            </option>
            {stats?.byAuthor.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.jumlahPost}){a.active ? "" : " · nonaktif"}
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
                Status: {STATUS_META[status]?.label ?? status}
              </ActiveChip>
            )}
            {author && (
              <ActiveChip onClear={() => setParams({ author: null })}>
                Penulis: {authorLabel}
              </ActiveChip>
            )}
            <button
              onClick={() => setParams({ q: null, status: null, author: null })}
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
          icon={MessageSquareQuote}
          title={hasFilter ? "Tidak ada post yang cocok" : "Belum ada post"}
          description={
            hasFilter
              ? "Coba ubah kata kunci atau bersihkan filter yang aktif."
              : "Buat post pertama untuk feed Serambi di aplikasi."
          }
          action={
            hasFilter ? (
              <button
                onClick={() => setParams({ q: null, status: null, author: null })}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Bersihkan filter
              </button>
            ) : (
              <button
                onClick={() => setEditing("new")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Plus size={14} /> Post baru
              </button>
            )
          }
        />
      ) : view === "grid" ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((p) => (
            <PostCard key={p.id} {...rowProps(p)} />
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
            {items.map((p) => (
              <PostRow key={p.id} {...rowProps(p)} />
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

      {/* Post paling disukai */}
      {stats && stats.topLiked.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={15} className="text-emerald-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Post paling disukai
            </h2>
          </div>
          <ol className="space-y-2">
            {stats.topLiked.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 shrink-0 text-center font-bold text-slate-300 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {excerpt(t.body, 90)}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500 tabular-nums">
                  <Heart size={12} /> {num(t.likeCount)}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500 tabular-nums">
                  <MessageCircle size={12} /> {num(t.commentCount)}
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
            <BulkBtn
              disabled={busy}
              onClick={() => void runBulk("publish")}
              title="Terbitkan tanpa mengirim notifikasi (anti-spam)"
            >
              <Send size={13} /> Terbitkan
            </BulkBtn>
            <BulkBtn disabled={busy} onClick={() => void runBulk("draft")}>
              <FileEdit size={13} /> Draft
            </BulkBtn>
            <BulkBtn disabled={busy} onClick={() => void runBulk("archive")}>
              <Archive size={13} /> Arsipkan
            </BulkBtn>
            <select
              disabled={busy}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                void runBulk("author", v);
                e.target.value = "";
              }}
              className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 outline-none"
            >
              <option value="">Ganti penulis…</option>
              {stats?.byAuthor
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
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
            toast.tone === "ok" ? "bg-slate-900 text-white" : "bg-rose-600 text-white"
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

      {editing && (
        <PostEditor
          post={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            await refresh();
            notify(msg);
          }}
        />
      )}
    </div>
  );
}

// ─── Row / card ────────────────────────────────────────────────────────

interface ItemProps {
  p: SerambiPost;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

function PostRow({
  p,
  checked,
  busy,
  onToggle,
  onEdit,
  onPublish,
  onArchive,
  onDuplicate,
  onCopy,
  onDelete,
}: ItemProps) {
  const img = resolveImg(p.imageUrl);
  return (
    <div
      className={`flex items-start gap-3 p-3 transition sm:p-4 ${
        checked ? "bg-emerald-50/60" : "hover:bg-slate-50/70"
      }`}
    >
      <button
        onClick={onToggle}
        aria-label="Pilih post"
        className="mt-6 shrink-0 text-slate-300 hover:text-emerald-600"
      >
        {checked ? (
          <CheckSquare size={18} className="text-emerald-600" />
        ) : (
          <Square size={18} />
        )}
      </button>

      <button
        onClick={onEdit}
        aria-label="Edit post"
        className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-20 sm:w-20"
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-slate-300">
            <MessageSquareQuote size={22} />
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={p.status} />
          {!p.verified && (
            <span className="chip !bg-slate-100 !text-slate-500">
              Tanpa centang
            </span>
          )}
        </div>

        <button
          onClick={onEdit}
          className="block w-full text-left text-sm text-slate-800 hover:text-emerald-700"
        >
          <span className="line-clamp-2">{p.body}</span>
        </button>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
            <Avatar url={p.authorAvatarUrl} size={16} />
            {p.authorName}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Heart size={11} /> {num(p.likeCount)}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <MessageCircle size={11} /> {num(p.commentCount)}
          </span>
        </p>

        <DateLine p={p} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconBtn
          onClick={onPublish}
          disabled={busy}
          title={p.status === "published" ? "Jadikan draft" : "Terbitkan"}
          active={p.status === "published"}
        >
          {p.status === "published" ? <EyeOff size={14} /> : <Eye size={14} />}
        </IconBtn>
        <IconBtn onClick={onEdit} title="Edit post">
          <Pencil size={14} />
        </IconBtn>
        <RowMenu
          p={p}
          busy={busy}
          onPublish={onPublish}
          onArchive={onArchive}
          onDuplicate={onDuplicate}
          onCopy={onCopy}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function PostCard({
  p,
  checked,
  busy,
  onToggle,
  onEdit,
  onPublish,
  onArchive,
  onDuplicate,
  onCopy,
  onDelete,
}: ItemProps) {
  const img = resolveImg(p.imageUrl);
  return (
    <div
      className={`card flex flex-col overflow-visible transition ${
        checked ? "ring-2 ring-emerald-500" : ""
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-slate-100">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : (
          <button
            onClick={onEdit}
            className="grid h-full w-full place-items-center p-5 text-left"
          >
            <span className="line-clamp-4 text-sm leading-relaxed text-slate-500">
              {p.body}
            </span>
          </button>
        )}
        <button
          onClick={onToggle}
          aria-label="Pilih post"
          className="absolute left-2 top-2 rounded-md bg-white/90 p-1 text-slate-400 shadow-sm hover:text-emerald-600"
        >
          {checked ? (
            <CheckSquare size={16} className="text-emerald-600" />
          ) : (
            <Square size={16} />
          )}
        </button>
        <div className="absolute right-2 top-2 flex gap-1">
          <StatusBadge status={p.status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <button onClick={onEdit} className="text-left">
          <span className="line-clamp-3 text-sm text-slate-800 hover:text-emerald-700">
            {p.body}
          </span>
        </button>
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Avatar url={p.authorAvatarUrl} size={16} />
          {p.authorName}
        </p>
        <DateLine p={p} />
        {/* div, bukan <p>: RowMenu di dalamnya merender <div> (invalid di <p>). */}
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-slate-500 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Heart size={12} /> {num(p.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={12} /> {num(p.commentCount)}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <IconBtn
              onClick={onPublish}
              disabled={busy}
              title={p.status === "published" ? "Jadikan draft" : "Terbitkan"}
              active={p.status === "published"}
            >
              {p.status === "published" ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconBtn>
            <IconBtn onClick={onEdit} title="Edit post">
              <Pencil size={14} />
            </IconBtn>
            <RowMenu
              p={p}
              busy={busy}
              onPublish={onPublish}
              onArchive={onArchive}
              onDuplicate={onDuplicate}
              onCopy={onCopy}
              onDelete={onDelete}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Baris tanggal — inti dari "kapan post ini tayang". */
function DateLine({ p }: { p: SerambiPost }) {
  if (p.status === "scheduled" && p.scheduledAt) {
    return (
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-sky-700">
        <span
          className="inline-flex items-center gap-1"
          title={fmtDateTime(p.scheduledAt)}
        >
          <CalendarClock size={11} /> Tayang {fmtDateTime(p.scheduledAt)}
        </span>
        <span className="text-sky-500">({timeAgo(p.scheduledAt)})</span>
      </p>
    );
  }
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
      <span
        className="inline-flex items-center gap-1 text-slate-500"
        title={fmtDateTime(p.createdAt)}
      >
        {p.status === "published" ? (
          <CalendarCheck size={11} />
        ) : (
          <FileEdit size={11} />
        )}
        {p.status === "published" ? "Terbit" : "Dibuat"} {fmtDate(p.createdAt)}
      </span>
      {p.updatedAt && p.updatedAt !== p.createdAt && (
        <span title={fmtDateTime(p.updatedAt)}>
          · Diperbarui {timeAgo(p.updatedAt)}
        </span>
      )}
    </p>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  const Icon = meta.icon;
  return (
    <span className={`chip inline-flex items-center gap-1 ${meta.chip}`}>
      <Icon size={11} /> {meta.label}
    </span>
  );
}

function Avatar({ url, size = 20 }: { url?: string | null; size?: number }) {
  const src = resolveImg(url);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"
    >
      <MessageSquareQuote size={Math.round(size * 0.55)} />
    </span>
  );
}

/** Menu aksi tambahan per post (arsip, duplikat, komentar, hapus). */
function RowMenu({
  p,
  busy,
  onPublish,
  onArchive,
  onDuplicate,
  onCopy,
  onDelete,
}: {
  p: SerambiPost;
  busy: boolean;
  onPublish: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
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
              icon={p.status === "published" ? FileEdit : Send}
              onClick={() => {
                close();
                onPublish();
              }}
              disabled={busy}
            >
              {p.status === "published"
                ? "Kembalikan ke draft"
                : "Terbitkan sekarang"}
            </MenuItem>
            <MenuItem
              icon={p.status === "archived" ? ArchiveRestore : Archive}
              onClick={() => {
                close();
                onArchive();
              }}
              disabled={busy}
            >
              {p.status === "archived" ? "Pulihkan ke draft" : "Arsipkan"}
            </MenuItem>
            <MenuItem
              icon={MessageCircle}
              href={`/admin/serambi/comments?postId=${p.id}`}
              onClick={close}
            >
              Komentar post ini ({num(p.commentCount)})
            </MenuItem>
            <MenuItem
              icon={Link2}
              onClick={() => {
                close();
                onCopy();
              }}
            >
              Salin isi post
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
              Hapus post
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
  danger,
  disabled,
}: {
  icon: typeof Eye;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const cls = `flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
    danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"
  } disabled:opacity-40`;
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={cls}>
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
  title,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded-lg border p-2 transition disabled:opacity-40 ${
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-600"
          : "border-slate-200 bg-white text-slate-500 hover:border-emerald-500 hover:text-emerald-700"
      }`}
    >
      {children}
    </button>
  );
}

/** Chip angka statis (non-klik) untuk ringkasan antrean tayang. */
function CountChip({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "sky" | "slate";
}) {
  const cls =
    tone === "sky" && value > 0
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${cls}`}
    >
      {label}
      <span className="font-semibold tabular-nums">{num(value)}</span>
    </span>
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
        active ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-100"
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
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
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

// ─── Create / edit modal ───────────────────────────────────────────────

const MAX_BODY = 2000;
const DEFAULT_AUTHOR = "Rumah Qur'an";

function PostEditor({
  post,
  onClose,
  onSaved,
}: {
  post: SerambiPost | null;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
}) {
  const [body, setBody] = useState(post?.body ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(post?.imageUrl ?? null);
  const [authorName, setAuthorName] = useState(post?.authorName ?? DEFAULT_AUTHOR);
  const [authorAvatarUrl, setAuthorAvatarUrl] = useState<string | null>(
    post?.authorAvatarUrl ?? null,
  );
  // "" = tulis manual; selain itu = id master penulis yang dipilih.
  const [authorId, setAuthorId] = useState<string>(post?.authorId ?? "");
  const [status, setStatus] = useState<SerambiStatus>(post?.status ?? "draft");
  const [scheduledAt, setScheduledAt] = useState<string>(
    post?.scheduledAt ? toLocalInput(post.scheduledAt) : "",
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isEdit = !!post;

  // Daftar penulis aktif untuk dropdown.
  const { data: authorsRes } = useSWR(
    "/admin/serambi/authors?activeOnly=true",
    fetcherFull<SerambiAuthor[]>,
  );
  const authors = useMemo(() => authorsRes?.data ?? [], [authorsRes]);
  const isManual = authorId === "";

  function pickAuthor(id: string) {
    setAuthorId(id);
    if (id === "") return; // mode manual — biarkan nama/avatar apa adanya
    const a = authors.find((x) => x.id === id);
    if (a) {
      setAuthorName(a.name);
      setAuthorAvatarUrl(a.avatarUrl ?? null);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function uploadImage(file: File, target: "imageUrl" | "authorAvatarUrl") {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const access = tokenStore.access;
      const res = await fetch(`${API_URL}/admin/serambi/upload`, {
        method: "POST",
        headers: access ? { Authorization: `Bearer ${access}` } : undefined,
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.message ?? `HTTP ${res.status}`);
      }
      const url = json.data.url as string;
      if (target === "imageUrl") setImageUrl(url);
      else setAuthorAvatarUrl(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal upload gambar");
    } finally {
      setUploading(false);
    }
  }

  /** Isi waktu tayang cepat: +1 jam / besok pagi / lusa pagi. */
  function quickSchedule(hoursFromNow: number, atHour?: number) {
    const d = new Date();
    if (atHour === undefined) {
      d.setHours(d.getHours() + hoursFromNow);
    } else {
      d.setDate(d.getDate() + Math.round(hoursFromNow / 24));
      d.setHours(atHour, 0, 0, 0);
    }
    setStatus("scheduled");
    setScheduledAt(toLocalInput(d.toISOString()));
  }

  async function save(overrideStatus?: SerambiStatus) {
    const finalStatus = overrideStatus ?? status;
    if (!body.trim()) {
      setErr("Isi post tidak boleh kosong");
      return;
    }
    if (finalStatus === "scheduled" && !scheduledAt) {
      setErr("Pilih waktu tayang untuk post terjadwal");
      return;
    }
    if (saving) return;
    setSaving(true);
    setErr(null);
    const payload = {
      body: body.trim(),
      imageUrl: imageUrl ?? "",
      // authorId non-kosong → backend menyalin nama+avatar dari master.
      // "" → pakai nama/avatar manual di bawah.
      authorId,
      authorName: authorName.trim() || DEFAULT_AUTHOR,
      authorAvatarUrl: authorAvatarUrl ?? "",
      status: finalStatus,
      // Kirim waktu tayang (ISO) hanya saat terjadwal; status lain membersihkan.
      ...(finalStatus === "scheduled" && scheduledAt
        ? { scheduledAt: new Date(scheduledAt).toISOString() }
        : {}),
    };
    try {
      if (isEdit) {
        await apiFetch(`/admin/serambi/posts/${post!.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/admin/serambi/posts`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await onSaved(
        finalStatus === "scheduled"
          ? "Post dijadwalkan."
          : isEdit
            ? "Post diperbarui."
            : "Post dibuat.",
      );
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
      setSaving(false);
    }
  }

  const previewImg = resolveImg(imageUrl);
  const previewAvatar = resolveImg(authorAvatarUrl);
  const overLimit = body.length > MAX_BODY;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-2xl">
        <div className="card m-0 sm:m-4 max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isEdit ? "Edit post" : "Post baru"}
              </h2>
              {isEdit && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                  <span>Dibuat {fmtDateTime(post!.createdAt)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Heart size={11} /> {num(post!.likeCount)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle size={11} /> {num(post!.commentCount)}
                  </span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Isi kutipan / renungan
              </label>
              <span
                className={`text-xs tabular-nums ${
                  overLimit ? "text-rose-500" : "text-slate-400"
                }`}
              >
                {body.length}/{MAX_BODY}
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={MAX_BODY}
              placeholder="Sabar itu bukan diam, tapi terus melangkah dalam ketaatan…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Image */}
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Gambar (opsional)
            </label>
            <div className="flex items-center gap-3">
              {previewImg ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewImg}
                    alt=""
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    aria-label="Hapus gambar"
                    className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white shadow"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-500">
                  <ImagePlus size={20} />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(f, "imageUrl");
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {uploading && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Upload size={13} /> Mengunggah…
                </span>
              )}
            </div>
          </div>

          {/* Penulis (pilih master / tulis manual) + status */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Penulis
              </label>
              <select
                value={authorId}
                onChange={(e) => pickAuthor(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-emerald-500"
              >
                <option value="">✍️ Tulis manual…</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Link
                href="/admin/serambi/authors"
                className="mt-1 inline-block text-[11px] font-medium text-emerald-600 hover:underline"
              >
                + Kelola master penulis
              </Link>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SerambiStatus)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-emerald-500"
              >
                <option value="draft">Draft (tersembunyi)</option>
                <option value="scheduled">Terjadwal (tayang otomatis)</option>
                <option value="published">Published (tampil publik)</option>
                <option value="archived">Arsip</option>
              </select>
            </div>
          </div>

          {status === "scheduled" && (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Waktu tayang
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <QuickTime onClick={() => quickSchedule(1)}>+1 jam</QuickTime>
                <QuickTime onClick={() => quickSchedule(3)}>+3 jam</QuickTime>
                <QuickTime onClick={() => quickSchedule(24, 5)}>
                  Besok 05.00
                </QuickTime>
                <QuickTime onClick={() => quickSchedule(24, 18)}>
                  Besok 18.00
                </QuickTime>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Post tayang otomatis di feed saat waktu ini tiba (dicek berkala
                dari kunjungan feed). Waktu lampau = langsung tayang.
                {scheduledAt && ` Perkiraan: ${timeAgo(new Date(scheduledAt).toISOString())}.`}
              </p>
            </div>
          )}

          {isManual ? (
            <>
              {/* Nama penulis manual */}
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Nama penulis
                </label>
                <input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  maxLength={80}
                  placeholder={DEFAULT_AUTHOR}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500"
                />
              </div>

              {/* Avatar uploader manual */}
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Avatar penulis (opsional)
                </label>
                <div className="flex items-center gap-3">
                  {previewAvatar ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewAvatar}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setAuthorAvatarUrl(null)}
                        aria-label="Hapus avatar"
                        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white shadow"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-500">
                      <ImagePlus size={16} />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadImage(f, "authorAvatarUrl");
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  <span className="text-xs text-slate-400">
                    Kosongkan untuk pakai logo brand default.
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* Ringkasan penulis terpilih (read-only) */
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Avatar url={authorAvatarUrl} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {authorName}
                </p>
                <p className="text-[11px] text-slate-400">
                  Nama &amp; avatar dari master penulis. Ubah di “Kelola master
                  penulis”.
                </p>
              </div>
            </div>
          )}

          {/* Card preview */}
          <div className="mt-5">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Pratinjau kartu
            </p>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <Avatar url={authorAvatarUrl} size={36} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                    {authorName.trim() || DEFAULT_AUTHOR}
                    <span className="text-emerald-500">✔</span>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {status === "scheduled" && scheduledAt
                      ? fmtDateTime(new Date(scheduledAt).toISOString())
                      : "baru saja"}
                  </p>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {body.trim() || "Isi post akan tampil di sini…"}
              </p>
              {previewImg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewImg}
                  alt=""
                  className="mt-3 max-h-64 w-full rounded-xl object-cover"
                />
              )}
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Heart size={14} /> {isEdit ? num(post!.likeCount) : 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle size={14} /> {isEdit ? num(post!.commentCount) : 0}
                </span>
              </div>
            </div>
          </div>

          {err && (
            <div className="mt-4">
              <ErrorBox message={err} />
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(status === "scheduled" ? "scheduled" : "published")}
              disabled={saving || uploading || !body.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
            >
              {saving
                ? "Menyimpan…"
                : status === "scheduled"
                  ? "Jadwalkan"
                  : "Terbitkan"}
            </button>
            <button
              type="button"
              onClick={() => save("draft")}
              disabled={saving || uploading || !body.trim()}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-40"
            >
              Simpan sebagai draft
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={() => save()}
                disabled={saving || uploading || !body.trim()}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-40"
              >
                Simpan (status: {STATUS_META[status]?.label ?? status})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickTime({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
    >
      {children}
    </button>
  );
}
