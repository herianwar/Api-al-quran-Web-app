"use client";

import {
  Bookmark,
  Brain,
  Search,
  Smartphone,
  Users as UsersIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcherFull } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { DataTable, Pagination } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface AdminUser {
  id: string;
  email: string;
  nama: string | null;
  role: string;
  createdAt: string;
  _count: { bookmarks: number; hafalan: number; deviceTokens: number };
}

type RoleFilter = "" | "user" | "admin";
type Sort = "newest" | "oldest" | "email";

const ROLE_TABS: { value: RoleFilter; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "email", label: "Email A–Z" },
];

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
        role === "admin"
          ? "bg-amber-100 text-amber-700"
          : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {role}
    </span>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<
    Record<string, "role" | "delete" | undefined>
  >({});

  // Debounce the search box so we refetch only ~300ms after typing stops,
  // not on every keystroke. Reset to page 1 whenever the query changes.
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
    sort,
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(role ? { role } : {}),
  });
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/admin/users?${params.toString()}`,
    fetcherFull<AdminUser[]>,
    // Keep the previous page on screen while the next loads — avoids the
    // list flashing empty on every search/filter/page change.
    { keepPreviousData: true },
  );

  async function toggleRole(u: AdminUser) {
    if (busy[u.id] || u.id === me?.id) return;
    const next = u.role === "admin" ? "user" : "admin";
    if (!confirm(`Ubah role ${u.email} dari "${u.role}" menjadi "${next}"?`))
      return;
    setBusy((b) => ({ ...b, [u.id]: "role" }));
    try {
      await apiFetch(`/admin/users/${u.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: next }),
      });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mengubah role");
    } finally {
      setBusy((b) => ({ ...b, [u.id]: undefined }));
    }
  }

  async function deleteUser(u: AdminUser) {
    if (busy[u.id] || u.id === me?.id) return;
    if (
      !confirm(
        `HAPUS ${u.email}? Semua bookmark, hafalan, dan device token user akan ikut terhapus. Tidak bisa di-undo.`,
      )
    )
      return;
    setBusy((b) => ({ ...b, [u.id]: "delete" }));
    try {
      await apiFetch(`/admin/users/${u.id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menghapus user");
    } finally {
      setBusy((b) => ({ ...b, [u.id]: undefined }));
    }
  }

  const rows = data?.data ?? [];
  const total = data?.meta?.total;
  const filtering = !!debouncedQ || !!role;
  const description =
    typeof total === "number"
      ? filtering
        ? `${total.toLocaleString("id-ID")} hasil cocok`
        : `${total.toLocaleString("id-ID")} user terdaftar`
      : "Daftar semua user terdaftar. Klik email untuk lihat detail.";

  // Action buttons shared between the desktop table and the mobile cards.
  function Actions({ u, block }: { u: AdminUser; block?: boolean }) {
    if (u.id === me?.id) {
      return (
        <span className="text-xs font-medium text-slate-400">Akun Anda</span>
      );
    }
    return (
      <div
        className={
          block ? "flex gap-2" : "flex items-center justify-end gap-3"
        }
      >
        <button
          onClick={() => toggleRole(u)}
          disabled={!!busy[u.id]}
          className={
            block
              ? "flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:border-emerald-500 disabled:opacity-40"
              : "text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline disabled:opacity-40 disabled:no-underline"
          }
        >
          {busy[u.id] === "role"
            ? "…"
            : u.role === "admin"
              ? "Demote"
              : "Promote"}
        </button>
        <button
          onClick={() => deleteUser(u)}
          disabled={!!busy[u.id]}
          className={
            block
              ? "flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              : "text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-40 disabled:no-underline"
          }
        >
          {busy[u.id] === "delete" ? "Menghapus…" : "Hapus"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Pengguna" description={description} />

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari email atau nama…"
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

      {/* Filters: role tabs + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {ROLE_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setRole(t.value);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition ${
                role === t.value
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-emerald-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hidden sm:inline">Urutkan</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-emerald-500"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && !data && <Spinner label="Memuat user…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={UsersIcon}
          title="Tidak ada user"
          description={
            filtering
              ? "Tidak ada user cocok dengan filter ini."
              : "Belum ada user terdaftar."
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
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Nama</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-right" title="Bookmarks">
                    BM
                  </th>
                  <th className="px-4 py-3 text-right" title="Hafalan">
                    Hfl
                  </th>
                  <th className="px-4 py-3 text-right" title="Devices">
                    Dev
                  </th>
                  <th className="px-4 py-3 text-left">Dibuat</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </DataTable.Head>
              <DataTable.Body>
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="text-emerald-700 hover:text-emerald-800 hover:underline break-all"
                      >
                        {u.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {u.nama ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {u._count.bookmarks}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {u._count.hafalan}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {u._count.deviceTokens}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Actions u={u} />
                    </td>
                  </tr>
                ))}
              </DataTable.Body>
            </DataTable>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3">
            {rows.map((u) => (
              <li key={u.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-bold">
                    {(u.nama ?? u.email)[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="block font-semibold text-emerald-700 hover:underline break-all leading-tight"
                    >
                      {u.email}
                    </Link>
                    <p className="text-sm text-slate-600 truncate">
                      {u.nama ?? "—"}
                    </p>
                  </div>
                  <RoleBadge role={u.role} />
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Bookmark size={13} className="text-amber-500" />
                    {u._count.bookmarks}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Brain size={13} className="text-emerald-600" />
                    {u._count.hafalan}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Smartphone size={13} className="text-sky-600" />
                    {u._count.deviceTokens}
                  </span>
                  <span className="ml-auto text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString("id-ID")}
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100">
                  <Actions u={u} block />
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
