"use client";

import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import type { ShopOrderField, ShopOrderFieldType } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";

const TYPES: { value: ShopOrderFieldType; label: string }[] = [
  { value: "text", label: "Teks singkat" },
  { value: "textarea", label: "Teks panjang" },
  { value: "tel", label: "No. Telepon" },
  { value: "email", label: "Email" },
  { value: "number", label: "Angka" },
  { value: "select", label: "Pilihan (dropdown)" },
];

type Form = {
  id?: number;
  key: string;
  label: string;
  type: ShopOrderFieldType;
  placeholder: string;
  helpText: string;
  required: boolean;
  optionsText: string;
  isActive: boolean;
};

const EMPTY: Form = {
  key: "",
  label: "",
  type: "text",
  placeholder: "",
  helpText: "",
  required: true,
  optionsText: "",
  isActive: true,
};

/** Convert a label to a safe machine key: lowercase, underscores. */
function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]+/, "")
    .slice(0, 40);
}

export default function AdminFormBuilderPage() {
  const { data, error, isLoading, mutate } = useSWR<ShopOrderField[]>(
    "/admin/shop/order-fields",
    fetcher,
  );
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fields = data ?? [];

  async function save() {
    if (!form) return;
    setBusy(true);
    setErr(null);
    try {
      const options =
        form.type === "select"
          ? form.optionsText
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      const payload = {
        key: form.key,
        label: form.label,
        type: form.type,
        placeholder: form.placeholder || undefined,
        helpText: form.helpText || undefined,
        required: form.required,
        options,
        isActive: form.isActive,
      };
      if (form.id) {
        await apiFetch(`/admin/shop/order-fields/${form.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/shop/order-fields", {
          method: "POST",
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

  async function remove(f: ShopOrderField) {
    if (!confirm(`Hapus field "${f.label}"?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/admin/shop/order-fields/${f.id}`, { method: "DELETE" });
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal hapus");
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    // Optimistic reorder.
    await mutate(next, { revalidate: false });
    try {
      await apiFetch("/admin/shop/order-fields/reorder", {
        method: "PUT",
        body: JSON.stringify({ fieldIds: next.map((f) => f.id) }),
      });
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengubah urutan");
      await mutate();
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
        title="Form Builder Order"
        description="Atur field yang diisi pelanggan saat memesan (mode order = Form). Urutan = urutan tampil."
        action={
          <button
            onClick={() => setForm({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700"
          >
            <Plus size={14} /> Field baru
          </button>
        }
      />

      <div className="rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs px-4 py-3 leading-relaxed">
        Field aktif akan muncul di form order halaman produk. Untuk mengaktifkan
        mode form, buka <span className="font-semibold">Setting Toko →
        Metode pemesanan → Form</span>.
      </div>

      {isLoading && <Spinner label="Memuat field…" />}
      {error && <ErrorBox message={(error as Error).message} />}
      {err && <ErrorBox message={err} />}

      {data && (
        <div className="card divide-y divide-slate-100">
          {fields.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              Belum ada field. Tambahkan minimal nama & no HP.
            </p>
          ) : (
            fields.map((f, i) => (
              <div
                key={f.id}
                className="flex items-center gap-3 p-4 hover:bg-slate-50"
              >
                <div className="flex flex-col">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || busy}
                    className="text-slate-400 hover:text-emerald-600 disabled:opacity-30"
                    aria-label="Naik"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === fields.length - 1 || busy}
                    className="text-slate-400 hover:text-emerald-600 disabled:opacity-30"
                    aria-label="Turun"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <GripVertical size={16} className="text-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-0.5">
                    <p className="font-semibold text-slate-900">{f.label}</p>
                    <span className="text-[10px] font-mono text-slate-400">
                      {f.key}
                    </span>
                    <span className="chip chip-gold !bg-slate-100 !text-slate-600 uppercase">
                      {f.type}
                    </span>
                    {f.required && (
                      <span className="chip chip-gold !bg-rose-50 !text-rose-600">
                        wajib
                      </span>
                    )}
                    {!f.isActive && (
                      <span className="chip chip-gold !bg-slate-100 !text-slate-500">
                        nonaktif
                      </span>
                    )}
                  </div>
                  {f.type === "select" && f.options && (
                    <p className="text-xs text-slate-500 truncate">
                      Pilihan: {f.options.join(", ")}
                    </p>
                  )}
                  {f.helpText && (
                    <p className="text-xs text-slate-400 truncate">
                      {f.helpText}
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    setForm({
                      id: f.id,
                      key: f.key,
                      label: f.label,
                      type: f.type,
                      placeholder: f.placeholder ?? "",
                      helpText: f.helpText ?? "",
                      required: f.required,
                      optionsText: (f.options ?? []).join("\n"),
                      isActive: f.isActive,
                    })
                  }
                  className="rounded-lg border border-slate-200 bg-white p-2 hover:border-emerald-500 hover:text-emerald-700"
                  aria-label={`Edit ${f.label}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => remove(f)}
                  className="rounded-lg border border-rose-200 bg-white p-2 hover:bg-rose-50 text-rose-600"
                  aria-label={`Hapus ${f.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 my-8">
            <h2 className="font-bold text-lg text-slate-900 mb-4">
              {form.id ? "Edit field" : "Field baru"}
            </h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Label
                </span>
                <input
                  value={form.label}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f!,
                      label: e.target.value,
                      // Auto-fill key from label only when creating & untouched.
                      key:
                        !f!.id && (f!.key === "" || f!.key === slugifyKey(f!.label))
                          ? slugifyKey(e.target.value)
                          : f!.key,
                    }))
                  }
                  placeholder="Nama Lengkap"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Key (huruf kecil, underscore)
                </span>
                <input
                  value={form.key}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, key: e.target.value }))
                  }
                  placeholder="nama"
                  disabled={!!form.id}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono disabled:bg-slate-50 disabled:text-slate-400"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    Tipe
                  </span>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f!,
                        type: e.target.value as ShopOrderFieldType,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={form.required}
                    onChange={(e) =>
                      setForm((f) => ({ ...f!, required: e.target.checked }))
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Wajib diisi</span>
                </label>
              </div>

              {form.type === "select" && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">
                    Pilihan (satu per baris)
                  </span>
                  <textarea
                    value={form.optionsText}
                    onChange={(e) =>
                      setForm((f) => ({ ...f!, optionsText: e.target.value }))
                    }
                    rows={3}
                    placeholder={"Merah\nBiru\nHijau"}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Placeholder (opsional)
                </span>
                <input
                  value={form.placeholder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, placeholder: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">
                  Teks bantuan (opsional)
                </span>
                <input
                  value={form.helpText}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, helpText: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((f) => ({ ...f!, isActive: e.target.checked }))
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm">Aktif (tampil di form)</span>
              </label>
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
                disabled={
                  busy ||
                  !form.key ||
                  !form.label ||
                  (form.type === "select" && !form.optionsText.trim())
                }
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
