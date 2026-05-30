"use client";

import { ExternalLink, Pencil, Plus, ScrollText, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface TahlilEntry {
  id: number;
  urutan: number;
  judul: string;
  arab: string;
  latin: string | null;
  arti: string;
  hitungan: number | null;
  jenis: string | null;
}

interface FormState {
  id?: number;
  urutan: number;
  judul: string;
  arab: string;
  latin: string;
  arti: string;
  hitungan: string;
  jenis: string;
}

const EMPTY: FormState = {
  urutan: 1,
  judul: "",
  arab: "",
  latin: "",
  arti: "",
  hitungan: "",
  jenis: "",
};

const JENIS_OPTIONS = [
  { value: "", label: "Lainnya" },
  { value: "pembuka", label: "Pembuka" },
  { value: "surat", label: "Surat & Ayat" },
  { value: "tasbih", label: "Tasbih & Tahlil" },
  { value: "shalawat", label: "Shalawat" },
  { value: "doa", label: "Doa" },
];

function toForm(t: TahlilEntry): FormState {
  return {
    id: t.id,
    urutan: t.urutan,
    judul: t.judul,
    arab: t.arab,
    latin: t.latin ?? "",
    arti: t.arti,
    hitungan: t.hitungan?.toString() ?? "",
    jenis: t.jenis ?? "",
  };
}

export default function AdminTahlilPage() {
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<TahlilEntry | null>(null);

  const { data, error, isLoading, mutate } = useSWR<TahlilEntry[]>(
    "/admin/content/tahlil",
    fetcher,
  );

  const suggestedUrutan = data && data.length > 0
    ? Math.max(...data.map((t) => t.urutan)) + 1
    : 1;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      const payload = {
        urutan: editing.urutan,
        judul: editing.judul.trim(),
        arab: editing.arab.trim(),
        latin: editing.latin.trim() || null,
        arti: editing.arti.trim(),
        hitungan: editing.hitungan.trim()
          ? parseInt(editing.hitungan, 10)
          : null,
        jenis: editing.jenis.trim() || null,
      };
      if (editing.id) {
        await apiFetch(`/admin/content/tahlil/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/content/tahlil", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setEditing(null);
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const t = toDelete;
    if (!t) return;
    setToDelete(null);
    try {
      await apiFetch(`/admin/content/tahlil/${t.id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal hapus");
    }
  }

  if (isLoading && !data) return <Spinner label="Memuat…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tahlil"
        description="Urutan bacaan tahlil — pengantar, surat, tasbih, shalawat, doa penutup."
        action={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() =>
              setEditing({ ...EMPTY, urutan: suggestedUrutan })
            }
          >
            Tambah entry
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Tabel tahlil kosong"
          description="Jalankan seed `tahlil` di Seed Control atau klik 'Tambah entry'."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id} className="card p-4 flex items-start gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs shrink-0">
                {t.urutan}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-900 truncate">
                  {t.judul}
                </h3>
                <p className="arabic text-base text-slate-700 line-clamp-1 mt-0.5 text-right">
                  {t.arab}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                  {t.jenis && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 capitalize">
                      {t.jenis}
                    </span>
                  )}
                  {t.hitungan && (
                    <span className="font-mono">× {t.hitungan}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Link
                  href={`/tahlil#${t.urutan}`}
                  target="_blank"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <ExternalLink size={14} />
                </Link>
                <button
                  onClick={() => setEditing(toForm(t))}
                  className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setToDelete(t)}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <form
            onSubmit={save}
            className="card w-full max-w-2xl p-6 my-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing.id ? "Edit tahlil" : "Tahlil baru"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid sm:grid-cols-[100px_1fr] gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Urutan *
                </span>
                <input
                  required
                  type="number"
                  min={1}
                  value={editing.urutan}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, urutan: parseInt(e.target.value || "1", 10) } : s,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Judul *
                </span>
                <input
                  required
                  value={editing.judul}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, judul: e.target.value } : s,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">Arab *</span>
              <textarea
                required
                value={editing.arab}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, arab: e.target.value } : s))
                }
                rows={4}
                className="arabic w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-right leading-loose"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Latin (opsional)
              </span>
              <textarea
                value={editing.latin}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, latin: e.target.value } : s))
                }
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm italic"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Arti *
              </span>
              <textarea
                required
                value={editing.arti}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, arti: e.target.value } : s))
                }
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Hitungan (opsional)
                </span>
                <input
                  type="number"
                  min={1}
                  value={editing.hitungan}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, hitungan: e.target.value } : s,
                    )
                  }
                  placeholder="e.g. 3 untuk 3x"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Jenis
                </span>
                <select
                  value={editing.jenis}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, jenis: e.target.value } : s,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {JENIS_OPTIONS.map((j) => (
                    <option key={j.value} value={j.value}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Batal
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {editing.id ? "Simpan" : "Buat"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus entry tahlil?"
        message={
          toDelete ? `"${toDelete.judul}" akan dihapus permanen.` : ""
        }
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
