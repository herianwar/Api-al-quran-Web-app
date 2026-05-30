"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import type { ShopCategory } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";

type Form = {
  id?: number;
  slug: string;
  nama: string;
  deskripsi: string;
  sortOrder: number;
  isActive: boolean;
};

const EMPTY: Form = {
  slug: "",
  nama: "",
  deskripsi: "",
  sortOrder: 0,
  isActive: true,
};

export default function AdminShopCategoriesPage() {
  const { data, error, isLoading, mutate } = useSWR<ShopCategory[]>(
    "/admin/shop/categories",
    fetcher,
  );
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!form) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        slug: form.slug,
        nama: form.nama,
        deskripsi: form.deskripsi || undefined,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (form.id) {
        await apiFetch(`/admin/shop/categories/${form.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/shop/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await mutate();
      setForm(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: ShopCategory) {
    if (!confirm(`Hapus kategori "${c.nama}"?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/admin/shop/categories/${c.id}`, { method: "DELETE" });
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal hapus");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/shop"
        className="inline-block text-sm text-emerald-700 hover:underline"
      >
        ← Toko
      </Link>
      <PageHeader
        title="Kategori"
        description="Kategori produk toko."
        action={
          <button
            onClick={() => setForm({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
          >
            <Plus size={14} /> Kategori baru
          </button>
        }
      />

      {isLoading && <Spinner label="Memuat kategori…" />}
      {error && <ErrorBox message={(error as Error).message} />}
      {err && <ErrorBox message={err} />}

      {data && (
        <div className="card divide-y divide-slate-100">
          {data.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              Belum ada kategori.
            </p>
          ) : (
            data.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-4 hover:bg-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-slate-900">{c.nama}</p>
                    <span className="text-[10px] font-mono text-slate-400">
                      /{c.slug}
                    </span>
                    {!c.isActive && (
                      <span className="chip chip-gold !bg-slate-100 !text-slate-600">
                        nonaktif
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {c.productCount ?? 0} produk · order #{c.sortOrder}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setForm({
                      id: c.id,
                      slug: c.slug,
                      nama: c.nama,
                      deskripsi: c.deskripsi ?? "",
                      sortOrder: c.sortOrder,
                      isActive: c.isActive,
                    })
                  }
                  className="rounded-lg border border-slate-200 bg-white p-2 hover:border-emerald-500 hover:text-emerald-700"
                  aria-label={`Edit ${c.nama}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => remove(c)}
                  className="rounded-lg border border-rose-200 bg-white p-2 hover:bg-rose-50 text-rose-600"
                  aria-label={`Hapus ${c.nama}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5">
            <h2 className="font-bold text-lg text-slate-900 mb-4">
              {form.id ? "Edit kategori" : "Kategori baru"}
            </h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Slug (lowercase, dash)
                </span>
                <input
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, slug: e.target.value }))
                  }
                  placeholder="mukena"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Nama</span>
                <input
                  value={form.nama}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, nama: e.target.value }))
                  }
                  placeholder="Mukena"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Deskripsi (opsional)
                </span>
                <textarea
                  value={form.deskripsi}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, deskripsi: e.target.value }))
                  }
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    Sort order
                  </span>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f!,
                        sortOrder: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                  />
                </label>
                <label className="flex items-end gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((f) => ({ ...f!, isActive: e.target.checked }))
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Aktif</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setForm(null)}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={save}
                disabled={busy || !form.slug || !form.nama}
                className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
              >
                {busy ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
