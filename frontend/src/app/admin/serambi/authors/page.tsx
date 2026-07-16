"use client";

import {
  ArrowLeft,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { API_URL, apiFetch, fetcherFull, tokenStore } from "@/lib/api";
import type { SerambiAuthor } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

/** Origin backend tanpa suffix /api/vN — untuk absolutkan URL relatif. */
const ORIGIN = API_URL.replace(/\/api\/v\d+\/?$/, "");
function resolveImg(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${ORIGIN}${url}`;
}

export default function AdminSerambiAuthorsPage() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState<SerambiAuthor | "new" | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ ...(debouncedQ ? { q: debouncedQ } : {}) });
  const { data, error, isLoading, mutate } = useSWR(
    `/admin/serambi/authors?${params.toString()}`,
    fetcherFull<SerambiAuthor[]>,
    { keepPreviousData: true },
  );
  const rows = data?.data ?? [];

  async function refresh() {
    await mutate();
  }

  async function toggleActive(a: SerambiAuthor) {
    try {
      await apiFetch(`/admin/serambi/authors/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !a.active }),
      });
      await refresh();
    } catch {
      /* diabaikan — UI akan tetap konsisten setelah revalidate berikutnya */
    }
  }

  async function remove(a: SerambiAuthor) {
    const count = a._count?.posts ?? 0;
    const extra =
      count > 0
        ? `\n\n${count} post memakai penulis ini — post tetap ada, nama & avatar yang sudah tersimpan tidak berubah.`
        : "";
    if (!confirm(`Hapus penulis "${a.name}"?${extra}`)) return;
    try {
      await apiFetch(`/admin/serambi/authors/${a.id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus penulis");
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href="/admin/serambi"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-emerald-700"
      >
        <ArrowLeft size={15} /> Kembali ke Serambi
      </Link>

      <PageHeader
        title="Master Penulis"
        description={
          typeof data?.meta?.total === "number"
            ? `${data.meta.total} penulis`
            : "Kelola nama & avatar penulis — dipilih saat membuat post."
        }
        action={
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus size={16} />
            Penulis baru
          </button>
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
          placeholder="Cari nama penulis…"
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

      {isLoading && !data && <Spinner label="Memuat penulis…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={Users}
          title="Belum ada penulis"
          description="Tambah penulis agar bisa dipilih saat membuat post Serambi."
        />
      )}

      {rows.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((a) => {
            const avatar = resolveImg(a.avatarUrl);
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <Users size={18} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {a.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {(a._count?.posts ?? 0).toLocaleString("id-ID")} post
                    {!a.active && " · nonaktif"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(a)}
                  title={a.active ? "Nonaktifkan" : "Aktifkan"}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    a.active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {a.active ? "Aktif" : "Nonaktif"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  title="Edit"
                  aria-label="Edit"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-600"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  title="Hapus"
                  aria-label="Hapus"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-rose-500 hover:border-rose-300 hover:bg-rose-50"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <AuthorEditor
          author={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function AuthorEditor({
  author,
  onClose,
  onSaved,
}: {
  author: SerambiAuthor | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(author?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    author?.avatarUrl ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!author;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function uploadAvatar(file: File) {
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
      setAvatarUrl(json.data.url as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal upload avatar");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!name.trim()) {
      setErr("Nama penulis tidak boleh kosong");
      return;
    }
    if (saving) return;
    setSaving(true);
    setErr(null);
    const payload = { name: name.trim(), avatarUrl: avatarUrl ?? "" };
    try {
      if (isEdit) {
        await apiFetch(`/admin/serambi/authors/${author!.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/admin/serambi/authors`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
      setSaving(false);
    }
  }

  const preview = resolveImg(avatarUrl);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md">
        <div className="card m-0 sm:m-4 max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit ? "Edit penulis" : "Penulis baru"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nama penulis
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="mis. Ustadz Ahmad"
              autoFocus
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-emerald-500"
            />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Avatar (opsional)
            </label>
            <div className="flex items-center gap-3">
              {preview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    aria-label="Hapus avatar"
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white shadow"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-emerald-400 hover:text-emerald-500">
                  <ImagePlus size={18} />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
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
            <p className="mt-1.5 text-[11px] text-slate-400">
              Gambar otomatis dioptimalkan ke WebP.
            </p>
          </div>

          {err && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {err}
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => save()}
              disabled={saving || uploading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Menyimpan…" : isEdit ? "Simpan" : "Buat penulis"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
