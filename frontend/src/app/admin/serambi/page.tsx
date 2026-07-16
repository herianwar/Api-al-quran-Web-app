"use client";

import {
  Archive,
  Eye,
  EyeOff,
  Heart,
  ImagePlus,
  MessageCircle,
  MessageSquareQuote,
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
import type { SerambiAuthor, SerambiPost, SerambiStatus } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { DataTable, Pagination } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

// ─── Helpers ───────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "bg-slate-200 text-slate-700" },
  published: { label: "Published", badge: "bg-emerald-100 text-emerald-700" },
  archived: { label: "Arsip", badge: "bg-rose-100 text-rose-700" },
};

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Arsip" },
];

/** Origin backend tanpa suffix /api/vN — untuk menjadikan URL relatif absolut. */
const ORIGIN = API_URL.replace(/\/api\/v\d+\/?$/, "");
function resolveImg(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${ORIGIN}${url}`;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  if (hr < 24) return `${hr} jam lalu`;
  if (day < 30) return `${day} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID");
}

// ─── Page ──────────────────────────────────────────────────────────────

export default function AdminSerambiPage() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<SerambiPost | "new" | null>(null);

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
    `/admin/serambi/posts?${params.toString()}`,
    fetcherFull<SerambiPost[]>,
    { keepPreviousData: true },
  );

  const rows = data?.data ?? [];
  const total = data?.meta?.total;
  const filtering = !!debouncedQ || !!status;
  const description =
    typeof total === "number"
      ? filtering
        ? `${total.toLocaleString("id-ID")} hasil cocok`
        : `${total.toLocaleString("id-ID")} post di Serambi`
      : "Kutipan & renungan singkat untuk feed Serambi di app.";

  async function refresh() {
    await mutate();
  }

  // Quick per-row status actions (publish/unpublish/archive) without opening
  // the editor.
  async function setRowStatus(post: SerambiPost, next: SerambiStatus) {
    try {
      await apiFetch(`/admin/serambi/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengubah status");
    }
  }

  async function removeRow(post: SerambiPost) {
    if (!confirm("Hapus post ini beserta semua like & komentarnya?")) return;
    try {
      await apiFetch(`/admin/serambi/posts/${post.id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Serambi"
        description={description}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/serambi/authors"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
            >
              <Users size={15} />
              Penulis
            </Link>
            <Link
              href="/admin/serambi/comments"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
            >
              <MessageCircle size={15} />
              Moderasi komentar
            </Link>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Plus size={16} />
              Post baru
            </button>
          </div>
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
          placeholder="Cari isi post…"
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

      {isLoading && !data && <Spinner label="Memuat post…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={MessageSquareQuote}
          title="Belum ada post"
          description={
            filtering
              ? "Tidak ada post cocok dengan filter ini."
              : "Buat post pertama untuk feed Serambi."
          }
          action={
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Plus size={16} />
              Post baru
            </button>
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
                  <th className="px-4 py-3 text-left">Post</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Interaksi</th>
                  <th className="px-4 py-3 text-left">Dibuat</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </DataTable.Head>
              <DataTable.Body>
                {rows.map((p) => {
                  const img = resolveImg(p.imageUrl);
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-slate-100 hover:bg-slate-50/50"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          className="flex items-start gap-3 text-left"
                        >
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-300">
                              <MessageSquareQuote size={18} />
                            </span>
                          )}
                          <span className="max-w-md">
                            <span className="line-clamp-2 text-sm text-slate-800">
                              {p.body}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-400">
                              {p.authorName}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Heart size={13} /> {p.likeCount}
                        </span>
                        <span className="ml-3 inline-flex items-center gap-1">
                          <MessageCircle size={13} /> {p.commentCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {relativeTime(p.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {p.status === "published" ? (
                            <IconBtn
                              title="Jadikan draft"
                              onClick={() => setRowStatus(p, "draft")}
                            >
                              <EyeOff size={15} />
                            </IconBtn>
                          ) : (
                            <IconBtn
                              title="Terbitkan"
                              onClick={() => setRowStatus(p, "published")}
                            >
                              <Eye size={15} />
                            </IconBtn>
                          )}
                          {p.status !== "archived" && (
                            <IconBtn
                              title="Arsipkan"
                              onClick={() => setRowStatus(p, "archived")}
                            >
                              <Archive size={15} />
                            </IconBtn>
                          )}
                          <IconBtn
                            title="Hapus"
                            danger
                            onClick={() => removeRow(p)}
                          >
                            <Trash2 size={15} />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </DataTable.Body>
            </DataTable>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3">
            {rows.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="card w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-800 line-clamp-3">
                      {p.body}
                    </p>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Heart size={12} /> {p.likeCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle size={12} /> {p.commentCount}
                    </span>
                    <span className="ml-auto">{relativeTime(p.createdAt)}</span>
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

      {editing && (
        <PostEditor
          post={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
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
  onSaved: () => Promise<void>;
}) {
  const [body, setBody] = useState(post?.body ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    post?.imageUrl ?? null,
  );
  const [authorName, setAuthorName] = useState(post?.authorName ?? DEFAULT_AUTHOR);
  const [authorAvatarUrl, setAuthorAvatarUrl] = useState<string | null>(
    post?.authorAvatarUrl ?? null,
  );
  // "" = tulis manual; selain itu = id master penulis yang dipilih.
  const [authorId, setAuthorId] = useState<string>(post?.authorId ?? "");
  const [status, setStatus] = useState<SerambiStatus>(post?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isEdit = !!post;

  // Daftar penulis aktif untuk dropdown.
  const { data: authorsRes } = useSWR(
    "/admin/serambi/authors?activeOnly=true",
    fetcherFull<SerambiAuthor[]>,
  );
  const authors = authorsRes?.data ?? [];
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

  async function uploadImage(
    file: File,
    target: "imageUrl" | "authorAvatarUrl",
  ) {
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

  async function save(overrideStatus?: SerambiStatus) {
    const finalStatus = overrideStatus ?? status;
    if (!body.trim()) {
      setErr("Isi post tidak boleh kosong");
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
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
      setSaving(false);
    }
  }

  const previewImg = resolveImg(imageUrl);
  const previewAvatar = resolveImg(authorAvatarUrl);

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
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit ? "Edit post" : "Post baru"}
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

          {/* Body */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Isi kutipan / renungan
              </label>
              <span
                className={`text-xs ${
                  body.length > MAX_BODY ? "text-rose-500" : "text-slate-400"
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
                <option value="published">Published (tampil publik)</option>
                <option value="archived">Arsip</option>
              </select>
            </div>
          </div>

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
              {previewAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewAvatar}
                  alt=""
                  className="h-11 w-11 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <MessageSquareQuote size={16} />
                </span>
              )}
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
                {previewAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewAvatar}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <MessageSquareQuote size={16} />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                    {authorName.trim() || DEFAULT_AUTHOR}
                    <span className="text-emerald-500">✔</span>
                  </p>
                  <p className="text-[11px] text-slate-400">baru saja</p>
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
                  <Heart size={14} /> 0
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle size={14} /> 0
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
              onClick={() => save("published")}
              disabled={saving || uploading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
            >
              {saving ? "Menyimpan…" : "Terbitkan"}
            </button>
            <button
              type="button"
              onClick={() => save("draft")}
              disabled={saving || uploading}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-40"
            >
              Simpan sebagai draft
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={() => save()}
                disabled={saving || uploading}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-40"
              >
                Simpan (status: {STATUS[status]?.label ?? status})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
