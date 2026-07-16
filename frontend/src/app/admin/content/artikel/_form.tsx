"use client";

import {
  CalendarClock,
  Check,
  Eye,
  ImageIcon,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, apiFetch, fetcher, tokenStore } from "@/lib/api";
import type {
  Artikel,
  ArtikelKategori,
  ArtikelStatus,
  ArtikelTag,
  SerambiAuthor,
} from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
import { TiptapEditor } from "@/components/TiptapEditor";

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
  authorId: string; // "" = tulis manual; selain itu id master penulis
  status: ArtikelStatus;
  scheduledAt: string; // datetime-local value
  isFeatured: boolean;
  tags: string;
  categoryId: number | "";
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
};

const EMPTY: Form = {
  slug: "",
  judul: "",
  ringkasan: "",
  konten: "",
  coverUrl: "",
  coverAlt: "",
  penulis: "",
  authorId: "",
  status: "draft",
  scheduledAt: "",
  isFeatured: false,
  tags: "",
  categoryId: "",
  metaTitle: "",
  metaDescription: "",
  ogImage: "",
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

/** Prepend API origin for relative /uploads URLs (display only). */
function resolveImg(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) {
    return `${API_URL.replace(/\/api\/v\d+\/?$/, "")}${url}`;
  }
  return url;
}

// Cover images are shown in the Android app as a 4:3 hero (~411×300dp) and a
// 1:1 list thumbnail, so 4:3 is the target ratio. The app never crops (it uses
// contain + a blurred backdrop), so off-ratio uploads are safe — but the closer
// the source is to 4:3, the less letterbox/blur appears. We surface that as a
// non-blocking warning here rather than resizing on the server.
const IDEAL_COVER_RATIO = 4 / 3;
const COVER_MIN_WIDTH = 800;

/** Load an image URL and resolve its intrinsic pixel size (0 on failure). */
function measureImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
  });
}

/** Human label for an aspect ratio, snapping to a common one when close. */
function ratioLabel(w: number, h: number): string {
  if (!w || !h) return "";
  const r = w / h;
  const commons: [number, number][] = [
    [1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [2, 1], [21, 9],
    [4, 5], [3, 4], [2, 3], [9, 16],
  ];
  let best = commons[0];
  let bestErr = Infinity;
  for (const [a, b] of commons) {
    const err = Math.abs(r - a / b);
    if (err < bestErr) {
      bestErr = err;
      best = [a, b];
    }
  }
  if (bestErr / r < 0.05) return `${best[0]}:${best[1]}`;
  return `${r.toFixed(2)}:1`;
}

/** Non-blocking guidance for a cover of the given size ([] when it's fine). */
function coverWarnings(dims: { w: number; h: number } | null): string[] {
  if (!dims || !dims.w || !dims.h) return [];
  const { w, h } = dims;
  const out: string[] = [];
  const r = w / h;
  if (Math.abs(r - IDEAL_COVER_RATIO) / IDEAL_COVER_RATIO > 0.15) {
    out.push(
      `Rasio gambar ${ratioLabel(w, h)} — jauh dari rasio ideal 4:3. ` +
        `Letakkan teks/objek penting di tengah gambar agar tetap terlihat penuh.`,
    );
  }
  if (w < COVER_MIN_WIDTH) {
    out.push(
      `Lebar gambar hanya ${w}px — sebaiknya minimal ${COVER_MIN_WIDTH}px ` +
        `agar tidak buram saat ditampilkan di layar besar.`,
    );
  }
  return out;
}

/** True when the editor HTML carries real content (text, image, or table). */
function htmlHasContent(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return text.length > 0 || /<(img|table|iframe|hr)\b/i.test(html);
}

/** ISO → value for <input type="datetime-local"> (local time). */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function ArtikelForm({ mode, id }: Props) {
  const router = useRouter();
  const { data: categories } = useSWR<ArtikelKategori[]>(
    "/admin/artikel/kategori",
    fetcher,
  );
  const { data: allTags } = useSWR<ArtikelTag[]>("/admin/artikel/tags", fetcher);
  // Master penulis bersama dengan Serambi.
  const { data: authors } = useSWR<SerambiAuthor[]>(
    "/admin/serambi/authors?activeOnly=true",
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
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [coverDims, setCoverDims] = useState<{ w: number; h: number } | null>(
    null,
  );
  const coverRef = useRef<HTMLInputElement | null>(null);

  // Snapshot of the last-saved payload (JSON) for dirty tracking + autosave.
  const savedSnapshot = useRef<string>("");
  const dirtyRef = useRef(false);
  const baselineSet = useRef(false);

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
        authorId: existing.authorId ?? "",
        status: existing.status,
        scheduledAt: toLocalInput(existing.scheduledAt),
        isFeatured: existing.isFeatured,
        tags: (existing.tags ?? []).join(", "),
        categoryId: existing.categoryId ?? "",
        metaTitle: existing.metaTitle ?? "",
        metaDescription: existing.metaDescription ?? "",
        ogImage: existing.ogImage ?? "",
      });
      setSlugTouched(true);
      setHydrated(true);
    }
  }, [existing, mode, hydrated]);

  // Measure the cover's intrinsic size whenever it changes (upload or hydrate)
  // so we can warn about off-ratio / low-res images before publish.
  useEffect(() => {
    if (!form.coverUrl) {
      setCoverDims(null);
      return;
    }
    let cancelled = false;
    void measureImage(resolveImg(form.coverUrl)).then((d) => {
      if (!cancelled) setCoverDims(d.w ? d : null);
    });
    return () => {
      cancelled = true;
    };
  }, [form.coverUrl]);

  function setJudul(judul: string) {
    setForm((f) => ({
      ...f,
      judul,
      slug: slugTouched ? f.slug : slugify(judul),
    }));
  }

  // Pilih master penulis → salin nama ke `penulis`. "" = tulis manual.
  function pickAuthor(authorId: string) {
    setForm((f) => {
      if (authorId === "") return { ...f, authorId: "" };
      const a = authors?.find((x) => x.id === authorId);
      return { ...f, authorId, penulis: a ? a.name : f.penulis };
    });
  }

  const buildPayload = useCallback(() => {
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: Record<string, unknown> = {
      slug: form.slug,
      judul: form.judul,
      ringkasan: form.ringkasan || undefined,
      konten: form.konten,
      coverUrl: form.coverUrl || undefined,
      coverAlt: form.coverAlt || undefined,
      penulis: form.penulis || undefined,
      // "" = tulis manual / lepas referensi; selain itu backend menyalin nama
      // dari master penulis ke `penulis`.
      authorId: form.authorId,
      status: form.status,
      isFeatured: form.isFeatured,
      tags,
      // null (not undefined) so "Tanpa kategori" actually detaches it.
      categoryId: form.categoryId === "" ? null : Number(form.categoryId),
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
      ogImage: form.ogImage || undefined,
    };
    if (form.status === "scheduled" && form.scheduledAt) {
      const d = new Date(form.scheduledAt);
      if (!isNaN(d.getTime())) payload.scheduledAt = d.toISOString();
    }
    return payload;
  }, [form]);

  // Track dirtiness against the last-saved snapshot. The first run after the
  // form is ready establishes a CLEAN baseline so autosave / the unsaved-leave
  // warning don't fire just from opening the page.
  useEffect(() => {
    if (!hydrated && mode === "edit") return;
    const cur = JSON.stringify(buildPayload());
    if (!baselineSet.current) {
      savedSnapshot.current = cur;
      baselineSet.current = true;
      dirtyRef.current = false;
      return;
    }
    dirtyRef.current = cur !== savedSnapshot.current;
  }, [buildPayload, hydrated, mode]);

  // Warn before leaving with unsaved changes (full reloads / tab close).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const save = useCallback(
    async (overrideStatus?: ArtikelStatus, opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) {
        setBusy(true);
        setErr(null);
        setOk(null);
      }
      try {
        const payload = buildPayload();
        if (overrideStatus) payload.status = overrideStatus;
        if (mode === "create") {
          const res = await apiFetch<Artikel>("/admin/artikel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          savedSnapshot.current = JSON.stringify(payload);
          dirtyRef.current = false;
          router.push(`/admin/content/artikel/${res.data.id}`);
        } else {
          await apiFetch(`/admin/artikel/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (overrideStatus) setForm((f) => ({ ...f, status: overrideStatus }));
          savedSnapshot.current = JSON.stringify(
            overrideStatus ? { ...payload, status: overrideStatus } : payload,
          );
          dirtyRef.current = false;
          const now = new Date();
          setSavedAt(
            `${String(now.getHours()).padStart(2, "0")}:${String(
              now.getMinutes(),
            ).padStart(2, "0")}`,
          );
          if (!silent) {
            await refetch();
            setOk("Tersimpan.");
          }
        }
      } catch (e) {
        if (!silent) setErr(e instanceof Error ? e.message : "Gagal menyimpan");
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [buildPayload, id, mode, refetch, router],
  );

  // Autosave (edit mode only): silently persist 3s after the last change.
  useEffect(() => {
    if (mode !== "edit" || !hydrated || busy) return;
    if (!dirtyRef.current) return;
    if (!form.judul || !form.slug || !htmlHasContent(form.konten)) return;
    const t = setTimeout(() => void save(undefined, { silent: true }), 3000);
    return () => clearTimeout(t);
  }, [form, mode, hydrated, busy, save]);

  async function uploadImage(file: File, target: "coverUrl" | "ogImage") {
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
      setForm((f) => ({ ...f, [target]: json.data.url as string }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload gambar gagal");
    } finally {
      setBusy(false);
      if (coverRef.current) coverRef.current.value = "";
    }
  }

  async function remove() {
    if (!id) return;
    if (!confirm("Hapus artikel ini? Tidak bisa di-undo.")) return;
    dirtyRef.current = false;
    setBusy(true);
    try {
      await apiFetch(`/admin/artikel/${id}`, { method: "DELETE" });
      router.push("/admin/content/artikel");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal hapus");
      setBusy(false);
    }
  }

  function toggleTag(tag: string) {
    setForm((f) => {
      const list = f.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const i = list.indexOf(tag);
      if (i >= 0) list.splice(i, 1);
      else list.push(tag);
      return { ...f, tags: list.join(", ") };
    });
  }

  const currentTags = form.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const canSave = !!form.judul && !!form.slug && htmlHasContent(form.konten);

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
            : "Tulis konten artikel seperti di Word — sekarang ditenagai Tiptap."
        }
        action={
          mode === "edit" ? (
            <div className="flex items-center gap-2">
              {savedAt && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-400">
                  <Check size={13} /> Tersimpan {savedAt}
                </span>
              )}
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
            <TiptapEditor
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
                    status: e.target.value as ArtikelStatus,
                  }))
                }
                className="rte-input"
              >
                <option value="draft">Draft (tersembunyi)</option>
                <option value="scheduled">Terjadwal (terbit otomatis)</option>
                <option value="published">Published (tampil publik)</option>
              </select>
            </Field>
            {form.status === "scheduled" && (
              <Field label="Waktu terbit">
                <div className="flex items-center gap-2">
                  <CalendarClock size={16} className="text-emerald-600 shrink-0" />
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, scheduledAt: e.target.value }))
                    }
                    className="rte-input"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Bila waktu sudah lewat, artikel langsung terbit.
                </p>
              </Field>
            )}
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
              {form.status !== "published" && (
                <button
                  onClick={() => void save("published")}
                  disabled={busy || !canSave}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2 text-sm font-semibold hover:bg-emerald-100 disabled:opacity-40"
                >
                  Simpan &amp; Terbitkan sekarang
                </button>
              )}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <Field label="Gambar sampul">
              {/* 4:3 frame with a contain preview — mirrors how the Android
                  app shows the cover (full image, never cropped, letterbox
                  filled with a blurred backdrop). The closer the source is to
                  4:3, the less letterbox appears here and in the app. */}
              <div className="aspect-[4/3] rounded-lg bg-slate-100 overflow-hidden mb-2 relative group">
                {form.coverUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImg(form.coverUrl)}
                      alt={form.coverAlt || "cover"}
                      className="w-full h-full object-contain"
                    />
                    {coverDims && (
                      <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {coverDims.w}×{coverDims.h} · {ratioLabel(coverDims.w, coverDims.h)}
                      </span>
                    )}
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
                    if (f) void uploadImage(f, "coverUrl");
                  }}
                />
              </label>
              {coverWarnings(coverDims).map((w) => (
                <p
                  key={w}
                  className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs leading-relaxed text-amber-700"
                >
                  <span aria-hidden>⚠️</span>
                  <span>{w}</span>
                </p>
              ))}
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Ukuran ideal <strong className="text-slate-500">1200 × 900 px</strong>{" "}
                (rasio 4:3, landscape). Gunakan JPG/WebP, ukuran file di bawah ~500&nbsp;KB
                agar cepat dimuat. Gambar <strong className="text-slate-500">tidak dipotong</strong>{" "}
                di aplikasi (ditampilkan utuh), tapi rasio mendekati 4:3 membuat tampilan
                paling rapi. Letakkan teks/objek penting di tengah gambar.
              </p>
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
              <select
                value={form.authorId}
                onChange={(e) => pickAuthor(e.target.value)}
                className="rte-input"
              >
                <option value="">✍️ Tulis manual…</option>
                {authors?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {form.authorId === "" ? (
                <input
                  value={form.penulis}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, penulis: e.target.value }))
                  }
                  className="rte-input mt-2"
                  placeholder="Nama penulis"
                />
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Dari master penulis Serambi. Kelola di{" "}
                  <Link
                    href="/admin/serambi/authors"
                    className="text-emerald-700 hover:underline"
                  >
                    Penulis
                  </Link>
                  .
                </p>
              )}
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
            {allTags && allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allTags.slice(0, 14).map((t) => {
                  const on = currentTags.includes(t.tag);
                  return (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => toggleTag(t.tag)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                        on
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                      }`}
                    >
                      {t.tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* SEO card */}
          <details className="card p-5 group">
            <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-700 list-none">
              <Search size={15} className="text-emerald-600" />
              SEO &amp; berbagi sosial
              <span className="ml-auto text-xs text-slate-400 group-open:hidden">
                buka
              </span>
            </summary>
            <div className="space-y-3 pt-4">
              <Field label="Meta title (kosong = pakai judul)">
                <input
                  value={form.metaTitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, metaTitle: e.target.value }))
                  }
                  className="rte-input"
                  maxLength={180}
                  placeholder={form.judul || "Judul untuk Google"}
                />
              </Field>
              <Field label="Meta description (kosong = pakai ringkasan)">
                <textarea
                  value={form.metaDescription}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, metaDescription: e.target.value }))
                  }
                  rows={2}
                  maxLength={320}
                  className="rte-input resize-y"
                  placeholder="Deskripsi singkat untuk hasil pencarian & preview link."
                />
              </Field>
              <Field label="Gambar Open Graph (kosong = pakai sampul)">
                {form.ogImage ? (
                  <div className="aspect-video rounded-lg bg-slate-100 overflow-hidden mb-2 relative group/og">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImg(form.ogImage)}
                      alt="og"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => setForm((f) => ({ ...f, ogImage: "" }))}
                      className="absolute top-2 right-2 bg-rose-600 text-white rounded-full p-1 opacity-0 group-hover/og:opacity-100 transition"
                      aria-label="Hapus OG image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-slate-50">
                  <Upload size={14} /> Upload gambar OG
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadImage(f, "ogImage");
                    }}
                  />
                </label>
              </Field>
            </div>
          </details>
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
