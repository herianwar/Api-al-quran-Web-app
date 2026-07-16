"use client";

import {
  ChevronLeft,
  ChevronRight,
  Save,
  ShoppingBag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, apiFetch, fetcher, tokenStore } from "@/lib/api";
import { resolveImage } from "@/lib/shop";
import type { ShopCategory, ShopProduct } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";

interface Props {
  mode: "create" | "edit";
  id?: number;
}

type Form = {
  slug: string;
  nama: string;
  deskripsi: string;
  hargaIdr: number;
  hargaCoret: number | "";
  stok: number | "";
  rating: number | "";
  ratingCount: number | "";
  soldCount: number | "";
  waNumber: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  categoryId: number | "";
};

const EMPTY: Form = {
  slug: "",
  nama: "",
  deskripsi: "",
  hargaIdr: 0,
  hargaCoret: "",
  stok: "",
  rating: "",
  ratingCount: "",
  soldCount: "",
  waNumber: "",
  isActive: true,
  isFeatured: false,
  sortOrder: 0,
  categoryId: "",
};

export function ProductForm({ mode, id }: Props) {
  const router = useRouter();
  const { data: categories } = useSWR<ShopCategory[]>(
    "/admin/shop/categories",
    fetcher,
  );
  const { data: existing, mutate: refetchProduct } = useSWR<ShopProduct>(
    mode === "edit" && id ? `/admin/shop/products/${id}` : null,
    fetcher,
  );

  const [form, setForm] = useState<Form>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Create mode: gambar dipilih dulu (di-stage), lalu di-upload setelah produk
  // dibuat (butuh product id). Edit mode meng-upload langsung.
  const [staged, setStaged] = useState<{ file: File; preview: string }[]>([]);

  // Bebaskan object URL preview saat unmount agar tak bocor memori.
  useEffect(() => {
    return () => staged.forEach((s) => URL.revokeObjectURL(s.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === "edit" && existing && !hydrated) {
      setForm({
        slug: existing.slug,
        nama: existing.nama,
        deskripsi: existing.deskripsi,
        hargaIdr: existing.hargaIdr,
        hargaCoret: existing.hargaCoret ?? "",
        stok: existing.stok ?? "",
        rating: existing.rating ?? "",
        ratingCount: existing.ratingCount ?? "",
        soldCount: existing.soldCount ?? "",
        waNumber: existing.waNumber ?? "",
        isActive: existing.isActive,
        isFeatured: existing.isFeatured,
        sortOrder: existing.sortOrder,
        categoryId: existing.categoryId,
      });
      setHydrated(true);
    }
  }, [existing, mode, hydrated]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        slug: form.slug,
        nama: form.nama,
        deskripsi: form.deskripsi,
        hargaIdr: Number(form.hargaIdr),
        isActive: form.isActive,
        isFeatured: form.isFeatured,
        sortOrder: Number(form.sortOrder),
        categoryId: Number(form.categoryId),
      };
      if (form.hargaCoret !== "") payload.hargaCoret = Number(form.hargaCoret);
      if (form.stok !== "") payload.stok = Number(form.stok);
      if (form.rating !== "") payload.rating = Number(form.rating);
      if (form.ratingCount !== "") payload.ratingCount = Number(form.ratingCount);
      if (form.soldCount !== "") payload.soldCount = Number(form.soldCount);
      if (form.waNumber) payload.waNumber = form.waNumber;

      if (mode === "create") {
        const res = await apiFetch<ShopProduct>("/admin/shop/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Upload foto yang sudah di-stage ke produk baru (berurutan agar
        // urutan tampil sesuai urutan pilih). Kegagalan foto tidak membatalkan
        // produk yang sudah dibuat — user diarahkan ke edit untuk melanjutkan.
        const newId = res.data.id;
        if (staged.length > 0) {
          try {
            for (const s of staged) await uploadOne(newId, s.file);
            staged.forEach((s) => URL.revokeObjectURL(s.preview));
          } catch (e) {
            setErr(
              (e instanceof Error ? e.message : "Sebagian foto gagal diupload") +
                " — produk sudah dibuat, lanjutkan upload di halaman edit.",
            );
          }
        }
        router.push(`/admin/shop/products/${newId}`);
      } else {
        await apiFetch(`/admin/shop/products/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await refetchProduct();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  /** Upload satu file ke produk tertentu; lempar error agar bisa ditangani. */
  async function uploadOne(productId: number, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const access = tokenStore.access;
    const res = await fetch(
      `${API_URL}/admin/shop/products/${productId}/images`,
      {
        method: "POST",
        headers: access ? { Authorization: `Bearer ${access}` } : undefined,
        body: fd,
      },
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message ?? `HTTP ${res.status}`);
    }
  }

  /** Edit mode: upload beberapa file sekaligus (berurutan) lalu refetch. */
  async function uploadFiles(files: FileList | File[]) {
    if (!id) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      for (const f of list) await uploadOne(id, f);
      await refetchProduct();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload gagal");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** Create mode: tampung file + preview lokal; upload saat produk disimpan. */
  function stageFiles(files: FileList | File[]) {
    const added = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setStaged((s) => [...s, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function unstage(index: number) {
    setStaged((s) => {
      const target = s[index];
      if (target) URL.revokeObjectURL(target.preview);
      return s.filter((_, i) => i !== index);
    });
  }

  /** Create mode: geser urutan foto ter-stage (urutan = urutan upload nanti). */
  function moveStaged(index: number, dir: -1 | 1) {
    setStaged((s) => {
      const to = index + dir;
      if (to < 0 || to >= s.length) return s;
      const next = [...s];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  /** Edit mode: geser urutan gambar (kiri/kanan) via endpoint reorder. */
  async function moveImage(index: number, dir: -1 | 1) {
    if (!id || !existing?.images) return;
    const imgs = [...existing.images];
    const to = index + dir;
    if (to < 0 || to >= imgs.length) return;
    [imgs[index], imgs[to]] = [imgs[to], imgs[index]];
    const imageIds = imgs.map((i) => i.id);
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/admin/shop/products/${id}/images/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds }),
      });
      await refetchProduct();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengurutkan gambar");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: number) {
    if (!confirm("Hapus gambar ini?")) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/admin/shop/images/${imageId}`, { method: "DELETE" });
      await refetchProduct();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal hapus gambar");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct() {
    if (!id) return;
    if (!confirm("Hapus produk ini? Tidak bisa di-undo.")) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/admin/shop/products/${id}`, { method: "DELETE" });
      router.push("/admin/shop/products");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal hapus");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/shop/products"
        className="inline-block text-sm text-emerald-700 hover:underline"
      >
        ← Produk
      </Link>
      <PageHeader
        title={mode === "create" ? "Produk baru" : "Edit produk"}
        description={
          mode === "edit" && existing
            ? `${existing.nama} (#${existing.id})`
            : "Isi detail produk."
        }
        action={
          mode === "edit" ? (
            <button
              onClick={deleteProduct}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 px-3.5 py-2 text-sm font-semibold hover:bg-rose-50 disabled:opacity-40"
            >
              <Trash2 size={14} /> Hapus
            </button>
          ) : null
        }
      />

      {err && <ErrorBox message={err} />}
      {mode === "edit" && !existing && <Spinner label="Memuat produk…" />}

      {/* Detail form */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <Field label="Nama">
              <input
                value={form.nama}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nama: e.target.value }))
                }
                className="input-row"
                placeholder="Mukena Katun Premium"
              />
            </Field>
            <Field label="Slug (lowercase, dash)">
              <input
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({ ...f, slug: e.target.value }))
                }
                className="input-row"
                placeholder="mukena-katun-premium"
              />
            </Field>
            <Field label="Deskripsi">
              <textarea
                value={form.deskripsi}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deskripsi: e.target.value }))
                }
                rows={6}
                className="input-row"
                placeholder="Bahan katun rayon adem… (bisa multi-paragraf)"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Harga (Rp)">
                <input
                  type="number"
                  value={form.hargaIdr}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      hargaIdr: Number(e.target.value),
                    }))
                  }
                  className="input-row tabular-nums"
                />
              </Field>
              <Field label="Harga coret (opsional)">
                <input
                  type="number"
                  value={form.hargaCoret}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      hargaCoret: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="input-row tabular-nums"
                />
              </Field>
              <Field label="Stok (kosongkan = tersedia tanpa angka)">
                <input
                  type="number"
                  value={form.stok}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      stok: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="input-row tabular-nums"
                />
              </Field>
              <Field label="Rating (0–5, kosongkan = belum ada)">
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={form.rating}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      rating: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="input-row tabular-nums"
                />
              </Field>
              <Field label="Jumlah penilai">
                <input
                  type="number"
                  min={0}
                  value={form.ratingCount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      ratingCount:
                        e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="input-row tabular-nums"
                />
              </Field>
              <Field label="Jumlah terjual (auto saat order selesai)">
                <input
                  type="number"
                  min={0}
                  value={form.soldCount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      soldCount:
                        e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="input-row tabular-nums"
                />
              </Field>
              <Field label="Sort order">
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sortOrder: Number(e.target.value),
                    }))
                  }
                  className="input-row tabular-nums"
                />
              </Field>
            </div>
            <Field label="Nomor WA override (opsional, format 62812xxx)">
              <input
                value={form.waNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, waNumber: e.target.value }))
                }
                className="input-row"
                placeholder="kosongkan untuk pakai default toko"
              />
            </Field>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <Field label="Kategori">
              <select
                value={form.categoryId}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    categoryId: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
                className="input-row"
              >
                <option value="">— Pilih kategori —</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: e.target.checked }))
                }
                className="w-4 h-4"
              />
              Aktif (tampil di /toko)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isFeatured: e.target.checked }))
                }
                className="w-4 h-4"
              />
              Unggulan (badge &ldquo;Pilihan&rdquo;)
            </label>
            <button
              onClick={save}
              disabled={busy || !form.nama || !form.slug || !form.categoryId}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
            >
              <Save size={14} /> {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </div>

          {/* Gambar — tersedia di create (staged) & edit (langsung) */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-1 text-sm">Gambar</h3>
            <p className="text-xs text-slate-500 mb-3">
              Gambar pertama jadi foto utama. Bisa pilih beberapa sekaligus.
            </p>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {mode === "create"
                ? staged.map((s, i) => (
                    <ImageThumb
                      key={s.preview}
                      src={s.preview}
                      primary={i === 0}
                      canPrev={i > 0}
                      canNext={i < staged.length - 1}
                      onPrev={() => moveStaged(i, -1)}
                      onNext={() => moveStaged(i, 1)}
                      onRemove={() => unstage(i)}
                    />
                  ))
                : existing?.images?.map((img, i) => (
                    <ImageThumb
                      key={img.id}
                      src={resolveImage(img.url, API_URL)}
                      alt={img.alt ?? ""}
                      primary={i === 0}
                      canPrev={i > 0}
                      canNext={i < (existing.images?.length ?? 0) - 1}
                      onPrev={() => moveImage(i, -1)}
                      onNext={() => moveImage(i, 1)}
                      onRemove={() => removeImage(img.id)}
                    />
                  ))}

              {(mode === "create" ? staged.length : existing?.images?.length ?? 0) ===
                0 && (
                <div className="col-span-3 aspect-video rounded-lg bg-slate-50 grid place-items-center text-slate-300">
                  <ShoppingBag size={28} />
                </div>
              )}
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-emerald-100">
              <Upload size={14} />
              {mode === "create" ? "Pilih foto" : "Upload gambar"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  if (mode === "create") stageFiles(files);
                  else void uploadFiles(files);
                }}
              />
            </label>
            <p className="text-xs text-slate-500 mt-2">
              jpg / png / webp · maks 5MB · otomatis dioptimalkan ke WebP
              {mode === "create" && staged.length > 0 && (
                <> · {staged.length} foto akan diupload saat disimpan</>
              )}
            </p>
          </div>
        </div>
      </div>
      <style jsx>{`
        :global(.input-row) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
          background: white;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          color: #0f172a;
          outline: none;
        }
        :global(.input-row:focus) {
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

/** Thumbnail gambar dengan tombol geser urutan, badge "Utama", dan hapus. */
function ImageThumb({
  src,
  alt = "",
  primary,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onRemove,
}: {
  src: string;
  alt?: string;
  primary: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full h-full object-cover" />

      {primary && (
        <span className="absolute top-1 left-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
          Utama
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
        aria-label="Hapus gambar"
      >
        <X size={12} />
      </button>

      <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 opacity-0 group-hover:opacity-100 transition">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Geser ke kiri"
          className="grid h-6 w-6 place-items-center rounded bg-slate-900/60 text-white disabled:opacity-0"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Geser ke kanan"
          className="grid h-6 w-6 place-items-center rounded bg-slate-900/60 text-white disabled:opacity-0"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
