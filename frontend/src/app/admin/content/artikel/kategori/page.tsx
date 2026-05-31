"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import type { ArtikelKategori } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";

type Form = {
  id?: number;
  slug: string;
  nama: string;
  deskripsi: string;
  urutan: number;
  isActive: boolean;
};

const EMPTY: Form = {
  slug: "",
  nama: "",
  deskripsi: "",
  urutan: 100,
  isActive: true,
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

export default function AdminArtikelKategoriPage() {
  const { data, error, isLoading, mutate } = useSWR<ArtikelKategori[]>(
    "/admin/artikel/kategori",
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
        urutan: form.urutan,
        isActive: form.isActive,
      };
      if (form.id) {
        await apiFetch(`/admin/artikel/kategori/${form.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/artikel/kategori", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setForm(null);
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan kategori");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Hapus kategori ini? Artikel di dalamnya jadi tanpa kategori."))
      return;
    try {
      await apiFetch(`/admin/artikel/kategori/${id}`, { method: "DELETE" });
      await mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal hapus");
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/content/artikel"
        className="inline-block text-sm text-emerald-700 hover:underline"
      >
        ← Artikel
      </Link>
      <PageHeader
        title="Kategori Artikel"
        description="Kelompokkan artikel agar mudah dijelajahi pembaca."
        action={
          <button
            onClick={() => setForm({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
          >
            <Plus size={14} /> Kategori baru
          </button>
        }
      />

      {err && <ErrorBox message={err} />}
      {isLoading && <Spinner label="Memuat kategori…" />}

      {form && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-slate-900 text-sm">
            {form.id ? "Edit kategori" : "Kategori baru"}
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">
                Nama
              </span>
              <input
                value={form.nama}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? {
                          ...f,
                          nama: e.target.value,
                          slug: f.id ? f.slug : slugify(e.target.value),
                        }
                      : f,
                  )
                }
                className="kat-input"
                placeholder="Kajian"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">
                Slug
              </span>
              <input
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, slug: e.target.value } : f))
                }
                className="kat-input"
                placeholder="kajian"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">
              Deskripsi (opsional)
            </span>
            <textarea
              value={form.deskripsi}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, deskripsi: e.target.value } : f))
              }
              rows={2}
              className="kat-input resize-y"
            />
          </label>
          <div className="flex items-center gap-4">
            <label className="block w-28">
              <span className="block text-xs font-semibold text-slate-600 mb-1">
                Urutan
              </span>
              <input
                type="number"
                value={form.urutan}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, urutan: Number(e.target.value) } : f,
                  )
                }
                className="kat-input tabular-nums"
              />
            </label>
            <label className="flex items-center gap-2 text-sm mt-5">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, isActive: e.target.checked } : f))
                }
                className="w-4 h-4"
              />
              Aktif
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy || !form.nama || !form.slug}
              className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
            <button
              onClick={() => setForm(null)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {(data ?? []).map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3 sm:p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-slate-900 text-sm">{c.nama}</p>
                {!c.isActive && (
                  <span className="chip !bg-slate-100 !text-slate-600">
                    nonaktif
                  </span>
                )}
                <span className="chip">{c.jumlahArtikel ?? 0} artikel</span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                /{c.slug} · urutan {c.urutan}
              </p>
            </div>
            <button
              onClick={() =>
                setForm({
                  id: c.id,
                  slug: c.slug,
                  nama: c.nama,
                  deskripsi: c.deskripsi ?? "",
                  urutan: c.urutan,
                  isActive: c.isActive,
                })
              }
              className="rounded-lg border border-slate-200 bg-white p-2 hover:border-emerald-500 hover:text-emerald-700"
              aria-label="Edit"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => remove(c.id)}
              className="rounded-lg border border-slate-200 bg-white p-2 hover:border-rose-400 hover:text-rose-600"
              aria-label="Hapus"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {(data ?? []).length === 0 && !isLoading && (
          <div className="p-8 text-center text-sm text-slate-500">
            Belum ada kategori.
          </div>
        )}
      </div>

      <style jsx global>{`
        .kat-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
          background: white;
          padding: 0.5rem 0.7rem;
          font-size: 0.875rem;
          color: #0f172a;
          outline: none;
        }
        .kat-input:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
        }
      `}</style>
    </div>
  );
}
