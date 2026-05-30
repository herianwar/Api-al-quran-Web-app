"use client";

import { Save, ShoppingBag, Trash2, Upload, X } from "lucide-react";
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

  useEffect(() => {
    if (mode === "edit" && existing && !hydrated) {
      setForm({
        slug: existing.slug,
        nama: existing.nama,
        deskripsi: existing.deskripsi,
        hargaIdr: existing.hargaIdr,
        hargaCoret: existing.hargaCoret ?? "",
        stok: existing.stok ?? "",
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
      if (form.waNumber) payload.waNumber = form.waNumber;

      if (mode === "create") {
        const res = await apiFetch<ShopProduct>("/admin/shop/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        router.push(`/admin/shop/products/${res.data.id}`);
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

  async function uploadImage(file: File) {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const access = tokenStore.access;
      const res = await fetch(`${API_URL}/admin/shop/products/${id}/images`, {
        method: "POST",
        headers: access ? { Authorization: `Bearer ${access}` } : undefined,
        body: fd,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      await refetchProduct();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload gagal");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

          {/* Image management — only after product exists */}
          {mode === "edit" && id && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">
                Gambar
              </h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {existing?.images && existing.images.length > 0 ? (
                  existing.images.map((img) => (
                    <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveImage(img.url, API_URL)}
                        alt={img.alt ?? ""}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                        aria-label="Hapus gambar"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 aspect-video rounded-lg bg-slate-50 grid place-items-center text-slate-300">
                    <ShoppingBag size={28} />
                  </div>
                )}
              </div>
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-emerald-100">
                <Upload size={14} />
                Upload gambar
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                  }}
                />
              </label>
              <p className="text-xs text-slate-500 mt-2">
                jpg / png / webp · maks 5MB
              </p>
            </div>
          )}
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
