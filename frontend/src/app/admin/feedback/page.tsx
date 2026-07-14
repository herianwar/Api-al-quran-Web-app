"use client";

import {
  Bug,
  Lightbulb,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcherFull } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { DataTable, Pagination } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

// ─── Domain ────────────────────────────────────────────────────────────

interface FeedbackUser {
  id: string;
  nama: string | null;
  email: string;
}

interface Feedback {
  id: string;
  kategori: string;
  judul: string;
  deskripsi: string;
  email: string | null;
  userId: string | null;
  user: FeedbackUser | null;
  appVersion: string | null;
  platform: string | null;
  status: string;
  catatanAdmin: string | null;
  createdAt: string;
  updatedAt: string;
}

const KATEGORI: Record<
  string,
  { label: string; badge: string; icon: typeof Bug }
> = {
  fitur_baru: {
    label: "Fitur Baru",
    badge: "bg-violet-100 text-violet-700",
    icon: Lightbulb,
  },
  bug: { label: "Bug", badge: "bg-rose-100 text-rose-700", icon: Bug },
  konten: {
    label: "Konten",
    badge: "bg-sky-100 text-sky-700",
    icon: MessageSquare,
  },
  lainnya: {
    label: "Lainnya",
    badge: "bg-slate-100 text-slate-600",
    icon: MoreHorizontal,
  },
};

const STATUS: Record<string, { label: string; badge: string }> = {
  baru: { label: "Baru", badge: "bg-slate-200 text-slate-700" },
  ditinjau: { label: "Ditinjau", badge: "bg-sky-100 text-sky-700" },
  dikerjakan: { label: "Dikerjakan", badge: "bg-amber-100 text-amber-700" },
  selesai: { label: "Selesai", badge: "bg-emerald-100 text-emerald-700" },
  ditolak: { label: "Ditolak", badge: "bg-rose-100 text-rose-700" },
};

const STATUS_ORDER = [
  "baru",
  "ditinjau",
  "dikerjakan",
  "selesai",
  "ditolak",
] as const;

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "Semua" },
  ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS[s].label })),
];

// ─── Presentational bits ───────────────────────────────────────────────

function KategoriBadge({ kategori }: { kategori: string }) {
  const k = KATEGORI[kategori] ?? KATEGORI.lainnya;
  const Icon = k.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${k.badge}`}
    >
      <Icon size={12} />
      {k.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.baru;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

/** "2 jam lalu" style relative time (id-ID), falls back to a date. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  if (hr < 24) return `${hr} jam lalu`;
  if (day < 30) return `${day} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID");
}

// ─── Page ──────────────────────────────────────────────────────────────

export default function AdminFeedbackPage() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [kategori, setKategori] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Feedback | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(status ? { status } : {}),
    ...(kategori ? { kategori } : {}),
  });
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/admin/feedback?${params.toString()}`,
    fetcherFull<Feedback[]>,
    { keepPreviousData: true },
  );

  const rows = data?.data ?? [];
  const total = data?.meta?.total;
  const filtering = !!debouncedQ || !!status || !!kategori;
  const description =
    typeof total === "number"
      ? filtering
        ? `${total.toLocaleString("id-ID")} hasil cocok`
        : `${total.toLocaleString("id-ID")} masukan masuk`
      : "Masukan & pengajuan fitur dari pengguna app.";

  // After a save/delete in the modal, refresh the list (and the sidebar badge
  // via the shared SWR key on the stats endpoint).
  async function refreshAll() {
    await mutate();
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Masukan & Fitur" description={description} />

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul atau isi masukan…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Bersihkan pencarian"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters: status tabs + kategori dropdown */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setStatus(t.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                status === t.value
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-emerald-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hidden sm:inline">Kategori</span>
          <select
            value={kategori}
            onChange={(e) => {
              setKategori(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-emerald-500"
          >
            <option value="">Semua kategori</option>
            {Object.entries(KATEGORI).map(([value, k]) => (
              <option key={value} value={value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && !data && <Spinner label="Memuat masukan…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="Belum ada masukan"
          description={
            filtering
              ? "Tidak ada masukan cocok dengan filter ini."
              : "Belum ada masukan dari pengguna."
          }
        />
      )}

      {data && rows.length > 0 && (
        <div
          className={
            isValidating ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          {/* Desktop: table */}
          <div className="hidden md:block">
            <DataTable>
              <DataTable.Head>
                <tr>
                  <th className="px-4 py-3 text-left">Judul</th>
                  <th className="px-4 py-3 text-left">Kategori</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Pengirim</th>
                  <th className="px-4 py-3 text-left">Platform</th>
                  <th className="px-4 py-3 text-left">Masuk</th>
                </tr>
              </DataTable.Head>
              <DataTable.Body>
                {rows.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setSelected(f)}
                    className="border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-xs">
                      <span className="line-clamp-1">{f.judul}</span>
                    </td>
                    <td className="px-4 py-3">
                      <KategoriBadge kategori={f.kategori} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[12rem]">
                      <span className="block truncate">
                        {f.user?.nama ?? f.user?.email ?? f.email ?? "Anonim"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {f.platform ?? "—"}
                      {f.appVersion ? (
                        <span className="text-slate-400"> · {f.appVersion}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {relativeTime(f.createdAt)}
                    </td>
                  </tr>
                ))}
              </DataTable.Body>
            </DataTable>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3">
            {rows.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setSelected(f)}
                  className="card w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-800 leading-tight line-clamp-2">
                      {f.judul}
                    </p>
                    <StatusBadge status={f.status} />
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">
                    {f.deskripsi}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <KategoriBadge kategori={f.kategori} />
                    <span className="text-slate-400">
                      {f.user?.nama ?? f.user?.email ?? f.email ?? "Anonim"}
                    </span>
                    <span className="ml-auto text-slate-400">
                      {relativeTime(f.createdAt)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <Pagination
            page={data.meta?.page ?? 1}
            totalPages={data.meta?.totalPages ?? 1}
            total={data.meta?.total}
            hasMore={!!data.meta?.hasMore}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      {selected && (
        <FeedbackDetail
          item={selected}
          onClose={() => setSelected(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
}

// ─── Detail modal ──────────────────────────────────────────────────────

function FeedbackDetail({
  item,
  onClose,
  onChanged,
}: {
  item: Feedback;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState(item.status);
  const [catatan, setCatatan] = useState(item.catatanAdmin ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = status !== item.status || catatan !== (item.catatanAdmin ?? "");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch(`/admin/feedback/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, catatanAdmin: catatan }),
      });
      await onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (deleting) return;
    if (!confirm("Hapus masukan ini? Tidak bisa di-undo.")) return;
    setDeleting(true);
    setErr(null);
    try {
      await apiFetch(`/admin/feedback/${item.id}`, { method: "DELETE" });
      await onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menghapus");
      setDeleting(false);
    }
  }

  const replyEmail = item.user?.email ?? item.email;
  const mailto = replyEmail
    ? `mailto:${replyEmail}?subject=${encodeURIComponent(
        `Re: ${item.judul} — Rumah Qur'an`,
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-2xl">
        <div className="card m-0 sm:m-4 max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <KategoriBadge kategori={item.kategori} />
              <StatusBadge status={item.status} />
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

          <h2 className="mt-3 text-lg font-bold text-slate-900">
            {item.judul}
          </h2>
          {/* Plain text rendering — never dangerouslySetInnerHTML (XSS safe). */}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
            {item.deskripsi}
          </p>

          {/* Meta grid */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
            <Meta label="Pengirim">
              {item.user ? (
                <Link
                  href={`/admin/users/${item.user.id}`}
                  className="text-emerald-700 hover:underline"
                >
                  {item.user.nama ?? item.user.email}
                </Link>
              ) : (
                <span className="text-slate-500">Anonim / guest</span>
              )}
            </Meta>
            <Meta label="Email">
              {replyEmail ? (
                <span className="break-all">{replyEmail}</span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </Meta>
            <Meta label="Platform">{item.platform ?? "—"}</Meta>
            <Meta label="Versi App">{item.appVersion ?? "—"}</Meta>
            <Meta label="Masuk">
              {new Date(item.createdAt).toLocaleString("id-ID")}
            </Meta>
          </dl>

          {/* Admin actions */}
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-emerald-500"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Catatan internal (tidak dikirim ke user)
              </label>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Progress, alasan ditolak, target rilis…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {err && <ErrorBox message={err} />}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
              >
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
              {mailto && (
                <a
                  href={mailto}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
                >
                  <Mail size={15} />
                  Balas via email
                </a>
              )}
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              >
                <Trash2 size={15} />
                {deleting ? "Menghapus…" : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-slate-700">{children}</dd>
    </div>
  );
}
