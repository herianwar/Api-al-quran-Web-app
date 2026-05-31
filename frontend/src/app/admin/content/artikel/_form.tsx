"use client";

import { Eye, ImageIcon, Save, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, apiFetch, fetcher, tokenStore } from "@/lib/api";
import type { Artikel, ArtikelKategori } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
import { RichTextEditor } from "@/components/RichTextEditor";

interface Props {
  mode: "create" | "edit";
  id?: number;
}

type Form = {
  slug: string;
  judul: string;
  ringkasan: string;
  konten: string;
  coverUrl: string;
  coverAlt: string;
  penulis: string;
  status: "draft" | "published";
  isFeatured: boolean;
  tags: string;
  categoryId: number | "";
};

const EMPTY: Form = {
  slug: "",
  judul: "",
  ringkasan: "",
  konten: "",
  coverUrl: "",
  coverAlt: "",
  penulis: "",
  status: "draft",
  isFeatured: false,
  tags: "",
  categoryId: "",
};

/** Turn a title into a URL slug. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 140);
}

/** Prepend API origin for relative /uploads URLs. */
function resolveImg(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) {
    return `${API_URL.replace(/\/api\/v\d+\/?$/, "")}${url}`;
  }
  return url;
}

export function ArtikelForm({ mode, id }: Props) {
  const router = useRouter();
  const { data: categories } = useSWR<ArtikelKategori[]>(
    "/admin/artikel/kategori",
    fetcher,
  );
  const { data: existing, mutate: refetch } = useSWR<Artikel>(
    mode === "edit" && id ? `/admin/artikel/${id}` : null,
    fetcher,
  );

  const [form, setForm] = useState<Form>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === "edit" && existing && !hydrated) {
      setForm({
        slug: existing.slug,
        judul: existing.judul,
        ringkasan: existing.ringkasan ?? "",
        konten: existing.konten,
        coverUrl: existing.coverUrl ?? "",
        coverAlt: existing.coverAlt ?? "",
        penulis: existing.penulis ?? "",
        status: existing.status,
        isFeatured: existing.isFeatured,
        tags: (existing.tags ?? []).join(", "),
        categoryId: existing.categoryId ?? "",
      });
      setSlugTouched(true);
      setHydrated(true);
    }
  }, [existing, mode, hydrated]);

  function setJudul(judul: string) {
    setForm((f) => ({
      ...f,
      judul,
      slug: slugTouched ? f.slug : slugify(judul),
    }));
  }

  function buildPayload() {
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      slug: form.slug,
      judul: form.judul,
      ringkasan: form.ringkasan || undefined,
      konten: form.konten,
      coverUrl: form.coverUrl || undefined,
      coverAlt: form.coverAlt || undefined,
      penulis: form.penulis || undefined,
      status: form.status,
      isFeatured: form.isFeatured,
      tags,
      categoryId: form.categoryId === "" ? undefined : Number(form.categoryId),
    };
  }

  async function save(overrideStatus?: "draft" | "published") {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const payload = buildPayload();
      if (overrideStatus) payload.status = overrideStatus;
      if (mode === "create") {
        const res = await apiFetch<Artikel>("/admin/artikel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        router.push(`/admin/content/artikel/${res.data.id}`);
      } else {
        await apiFetch(`/admin/artikel/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (overrideStatus) setForm((f) => ({ ...f, status: overrideStatus }));
        await refetch();
        setOk("Tersimpan.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const access = tokenStore.access;
      const res = await fetch(`${API_URL}/admin/artikel/upload`, {
        method: "POST",
        headers: access ? { Authorization: `Bearer ${access}` } : undefined,
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.message ?? `HTTP ${res.status}`);
      }
      setForm((f) => ({ ...f, coverUrl: json.data.url as string }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload cover gagal");
    } finally {
      setBusy(false);
      if (coverRef.current) coverRef.current.value = "";
    }
  }

  async function remove() {
    if (!id) return;
    if (!confirm("Hapus artikel ini? Tidak bisa di-undo.")) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/artikel/${id}`, { method: "DELETE" });
      router.push("/admin/content/artikel");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal hapus");
      setBusy(false);
    }
  }

  const canSave = !!form.judul && !!form.slug && !!form.konten.trim();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/content/artikel"
        className="inline-block text-sm text-emerald-700 hover:underline"
      >
        ← Artikel
      </Link>
      <PageHeader
        title={mode === "create" ? "Artikel baru" : "Edit artikel"}
        description={
          mode === "edit" && existing
            ? `${existing.judul} (#${existing.id}) · ${existing.views} kali dibaca`
            : "Tulis konten artikel seperti di Word."
        }
        action={
          mode === "edit" ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/content/artikel/${id}/preview`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 px-3.5 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                <Eye size={14} /> Pratinjau
              </Link>
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 px-3.5 py-2 text-sm font-semibold hover:bg-rose-50 disabled:opacity-40"
              >
                <Trash2 size={14} /> Hapus
              </button>
            </div>
          ) : null
        }
      />

      {err && <ErrorBox message={err} />}
      {ok && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">
          {ok}
        </div>
      )}
      {mode === "edit" && !existing && <Spinner label="Memuat artikel…" />}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main column: title + editor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <Field label="Judul">
              <input
                value={form.judul}
                onChange={(e) => setJudul(e.target.value)}
                className="rte-input text-lg font-semibold"
                placeholder="Judul artikel yang menarik…"
              />
            </Field>
            <Field label="Slug (URL)">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 shrink-0">/artikel/</span>
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  className="rte-input"
                  placeholder="judul-artikel"
                />
              </div>
            </Field>
            <Field label="Ringkasan (opsional — otomatis dari isi bila kosong)">
              <textarea
                value={form.ringkasan}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ringkasan: e.target.value }))
                }
                rows={2}
                className="rte-input resize-y"
                placeholder="Kalimat pembuka singkat untuk kartu daftar & hasil pencarian."
              />
            </Field>
          </div>

          <Field label="Isi artikel">
            <RichTextEditor
              value={form.konten}
              onChange={(html) => setForm((f) => ({ ...f, konten: html }))}
            />
          </Field>
        </div>

        {/* Sidebar: publish + meta */}
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as "draft" | "published",
                  }))
                }
                className="rte-input"
              >
                <option value="draft">Draft (tersembunyi)</option>
                <option value="published">Published (tampil publik)</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isFeatured: e.target.checked }))
                }
                className="w-4 h-4"
              />
              Unggulan (tampil di sorotan)
            </label>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => void save()}
                disabled={busy || !canSave}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
              >
                <Save size={14} /> {busy ? "Menyimpan…" : "Simpan"}
              </button>
              {form.status === "draft" && (
                <button
                  onClick={() => void save("published")}
                  disabled={busy || !canSave}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2 text-sm font-semibold hover:bg-emerald-100 disabled:opacity-40"
                >
                  Simpan & Terbitkan
                </button>
              )}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <Field label="Gambar sampul">
              <div className="aspect-video rounded-lg bg-slate-100 overflow-hidden mb-2 relative group">
                {form.coverUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImg(form.coverUrl)}
                      alt={form.coverAlt || "cover"}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => setForm((f) => ({ ...f, coverUrl: "" }))}
                      className="absolute top-2 right-2 bg-rose-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                      aria-label="Hapus cover"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <div className="w-full h-full grid place-items-center text-slate-300">
                    <ImageIcon size={32} />
                  </div>
                )}
              </div>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-emerald-100">
                <Upload size={14} /> Upload cover
                <input
                  ref={coverRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadCover(f);
                  }}
                />
              </label>
            </Field>
            <Field label="Alt text cover (opsional)">
              <input
                value={form.coverAlt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, coverAlt: e.target.value }))
                }
                className="rte-input"
                placeholder="Deskripsi singkat gambar"
              />
            </Field>
          </div>

          <div className="card p-5 space-y-3">
            <Field label="Kategori">
              <select
                value={form.categoryId}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    categoryId:
                      e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
                className="rte-input"
              >
                <option value="">— Tanpa kategori —</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Penulis">
              <input
                value={form.penulis}
                onChange={(e) =>
                  setForm((f) => ({ ...f, penulis: e.target.value }))
                }
                className="rte-input"
                placeholder="Nama penulis"
              />
            </Field>
            <Field label="Tag (pisahkan dengan koma)">
              <input
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
                className="rte-input"
                placeholder="kajian, sabar, doa"
              />
            </Field>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .rte-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
          background: white;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          color: #0f172a;
          outline: none;
        }
        .rte-input:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
