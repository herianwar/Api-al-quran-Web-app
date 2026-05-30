"use client";

import {
  ExternalLink,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, apiFetch, fetcher, tokenStore } from "@/lib/api";
import { resolveImage } from "@/lib/shop";
import type { ShopBanner } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";

type Form = {
  id?: number;
  title: string;
  subtitle: string;
  linkUrl: string;
  sortOrder: number;
  isActive: boolean;
};

const EMPTY: Form = {
  title: "",
  subtitle: "",
  linkUrl: "",
  sortOrder: 0,
  isActive: true,
};

export default function AdminShopBannersPage() {
  const { data, error, isLoading, mutate } = useSWR<ShopBanner[]>(
    "/admin/shop/banners",
    fetcher,
  );
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Per-banner file input refs so each row's "Upload" button targets its own input.
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  async function save() {
    if (!form) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        title: form.title || undefined,
        subtitle: form.subtitle || undefined,
        linkUrl: form.linkUrl || undefined,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (form.id) {
        await apiFetch(`/admin/shop/banners/${form.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/shop/banners", {
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

  async function uploadImage(bannerId: number, file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const access = tokenStore.access;
      const res = await fetch(
        `${API_URL}/admin/shop/banners/${bannerId}/image`,
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
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload gagal");
    } finally {
      setBusy(false);
      const input = fileInputs.current[bannerId];
      if (input) input.value = "";
    }
  }

  async function remove(b: ShopBanner) {
    if (!confirm(`Hapus banner ini? Tidak bisa di-undo.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/admin/shop/banners/${b.id}`, { method: "DELETE" });
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
        title="Banner"
        description="Banner promosi yang tampil di carousel atas halaman /toko (web & aplikasi)."
        action={
          <button
            onClick={() => setForm({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
          >
            <Plus size={14} /> Banner baru
          </button>
        }
      />

      {isLoading && <Spinner label="Memuat banner…" />}
      {error && <ErrorBox message={(error as Error).message} />}
      {err && <ErrorBox message={err} />}

      {data && (
        <div className="space-y-3">
          {data.length === 0 ? (
            <div className="card p-10 text-center">
              <ImageIcon size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                Belum ada banner. Klik &ldquo;Banner baru&rdquo;, lalu upload
                gambarnya.
              </p>
            </div>
          ) : (
            data.map((b) => (
              <div
                key={b.id}
                className="card flex flex-col sm:flex-row sm:items-center gap-4 p-4"
              >
                {/* Preview */}
                <div className="relative w-full sm:w-44 shrink-0 aspect-[16/7] rounded-xl overflow-hidden bg-slate-100 grid place-items-center">
                  {b.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveImage(b.imageUrl, API_URL)}
                      alt={b.title ?? "Banner"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={26} className="text-slate-300" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-slate-900 truncate">
                      {b.title || (
                        <span className="text-slate-400 italic">
                          (tanpa judul)
                        </span>
                      )}
                    </p>
                    {!b.isActive && (
                      <span className="chip chip-gold !bg-slate-100 !text-slate-600">
                        nonaktif
                      </span>
                    )}
                    {!b.imageUrl && (
                      <span className="chip chip-gold !bg-amber-100 !text-amber-700">
                        belum ada gambar
                      </span>
                    )}
                  </div>
                  {b.subtitle && (
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {b.subtitle}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                    <span>order #{b.sortOrder}</span>
                    {b.linkUrl && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <ExternalLink size={11} /> {b.linkUrl}
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <label
                    className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 p-2 cursor-pointer hover:bg-emerald-100"
                    aria-label="Upload gambar"
                    title={b.imageUrl ? "Ganti gambar" : "Upload gambar"}
                  >
                    <Upload size={14} />
                    <input
                      ref={(el) => {
                        fileInputs.current[b.id] = el;
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadImage(b.id, f);
                      }}
                    />
                  </label>
                  <button
                    onClick={() =>
                      setForm({
                        id: b.id,
                        title: b.title ?? "",
                        subtitle: b.subtitle ?? "",
                        linkUrl: b.linkUrl ?? "",
                        sortOrder: b.sortOrder,
                        isActive: b.isActive,
                      })
                    }
                    className="rounded-lg border border-slate-200 bg-white p-2 hover:border-emerald-500 hover:text-emerald-700"
                    aria-label="Edit banner"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove(b)}
                    className="rounded-lg border border-rose-200 bg-white p-2 hover:bg-rose-50 text-rose-600"
                    aria-label="Hapus banner"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {data && data.length > 0 && (
        <p className="text-xs text-slate-400">
          Banner tampil di /toko bila aktif <strong>dan</strong> sudah punya
          gambar. Urutan mengikuti <em>sort order</em> (kecil tampil duluan).
          Gambar: jpg / png / webp, maks 5MB — rasio lebar dianjurkan ±16:7.
        </p>
      )}

      {form && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5">
            <h2 className="font-bold text-lg text-slate-900 mb-4">
              {form.id ? "Edit banner" : "Banner baru"}
            </h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Judul (opsional)
                </span>
                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, title: e.target.value }))
                  }
                  placeholder="Promo Ramadhan"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Subjudul (opsional)
                </span>
                <input
                  value={form.subtitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, subtitle: e.target.value }))
                  }
                  placeholder="Diskon mukena & sajadah s.d. 30%"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Link tujuan (opsional)
                </span>
                <input
                  value={form.linkUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, linkUrl: e.target.value }))
                  }
                  placeholder="/toko/mukena-katun-premium atau https://…"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Path internal diawali &ldquo;/&rdquo;, atau URL penuh untuk
                  link eksternal.
                </span>
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
              {!form.id && (
                <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2.5">
                  Setelah disimpan, banner akan muncul di daftar — klik tombol{" "}
                  <Upload size={11} className="inline -mt-0.5" /> untuk upload
                  gambarnya.
                </p>
              )}
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
                disabled={busy}
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
