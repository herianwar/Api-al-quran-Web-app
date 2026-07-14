"use client";

import {
  ArrowLeft,
  Eye,
  EyeOff,
  MessageCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcherFull } from "@/lib/api";
import type { SerambiComment } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { DataTable, Pagination } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

const STATUS: Record<string, { label: string; badge: string }> = {
  visible: { label: "Tampil", badge: "bg-emerald-100 text-emerald-700" },
  hidden: { label: "Disembunyikan", badge: "bg-slate-200 text-slate-600" },
};

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "visible", label: "Tampil" },
  { value: "hidden", label: "Disembunyikan" },
];

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.visible;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  if (hr < 24) return `${hr} jam lalu`;
  if (day < 30) return `${day} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID");
}

export default function AdminSerambiCommentsPage() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

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
  });
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/admin/serambi/comments?${params.toString()}`,
    fetcherFull<SerambiComment[]>,
    { keepPreviousData: true },
  );

  const rows = data?.data ?? [];
  const total = data?.meta?.total;
  const filtering = !!debouncedQ || !!status;
  const description =
    typeof total === "number"
      ? filtering
        ? `${total.toLocaleString("id-ID")} hasil cocok`
        : `${total.toLocaleString("id-ID")} komentar`
      : "Moderasi komentar pengguna di feed Serambi.";

  async function toggleHide(c: SerambiComment) {
    const next = c.status === "visible" ? "hidden" : "visible";
    try {
      await apiFetch(`/admin/serambi/comments/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  }

  async function remove(c: SerambiComment) {
    if (!confirm("Hapus komentar ini permanen?")) return;
    try {
      await apiFetch(`/admin/serambi/comments/${c.id}`, { method: "DELETE" });
      await mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Moderasi Komentar Serambi"
        description={description}
        action={
          <Link
            href="/admin/serambi"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
          >
            <ArrowLeft size={15} />
            Kembali ke post
          </Link>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari isi komentar…"
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

      {/* Status tabs */}
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

      {isLoading && !data && <Spinner label="Memuat komentar…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={MessageCircle}
          title="Belum ada komentar"
          description={
            filtering
              ? "Tidak ada komentar cocok dengan filter ini."
              : "Belum ada komentar dari pengguna."
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
                  <th className="px-4 py-3 text-left">Komentar</th>
                  <th className="px-4 py-3 text-left">Penulis</th>
                  <th className="px-4 py-3 text-left">Post</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Waktu</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </DataTable.Head>
              <DataTable.Body>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="px-4 py-3 max-w-md">
                      {/* Plain text — never dangerouslySetInnerHTML (XSS). */}
                      <span
                        className={`line-clamp-2 text-sm ${
                          c.status === "hidden"
                            ? "text-slate-400 line-through"
                            : "text-slate-800"
                        }`}
                      >
                        {c.body}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[10rem]">
                      {c.user ? (
                        <Link
                          href={`/admin/users/${c.user.id}`}
                          className="block truncate text-emerald-700 hover:underline"
                        >
                          {c.user.nama ?? c.user.email}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[12rem]">
                      <span className="line-clamp-1">{c.post?.body ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {relativeTime(c.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title={
                            c.status === "visible" ? "Sembunyikan" : "Tampilkan"
                          }
                          onClick={() => toggleHide(c)}
                        >
                          {c.status === "visible" ? (
                            <EyeOff size={15} />
                          ) : (
                            <Eye size={15} />
                          )}
                        </IconBtn>
                        <IconBtn title="Hapus" danger onClick={() => remove(c)}>
                          <Trash2 size={15} />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable.Body>
            </DataTable>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3">
            {rows.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-sm ${
                      c.status === "hidden"
                        ? "text-slate-400 line-through"
                        : "text-slate-800"
                    }`}
                  >
                    {c.body}
                  </p>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <span className="truncate">
                    {c.user?.nama ?? c.user?.email ?? "—"}
                  </span>
                  <span className="ml-auto">{relativeTime(c.createdAt)}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleHide(c)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    {c.status === "visible" ? (
                      <>
                        <EyeOff size={13} /> Sembunyikan
                      </>
                    ) : (
                      <>
                        <Eye size={13} /> Tampilkan
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600"
                  >
                    <Trash2 size={13} /> Hapus
                  </button>
                </div>
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
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white ${
        danger
          ? "text-rose-500 hover:bg-rose-50 hover:border-rose-300"
          : "text-slate-500 hover:bg-slate-50 hover:border-emerald-400 hover:text-emerald-600"
      }`}
    >
      {children}
    </button>
  );
}
