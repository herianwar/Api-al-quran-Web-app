"use client";

import { ExternalLink, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface AyatRuj {
  surah: number;
  ayat: number;
  catatan?: string | null;
}

interface Nabi {
  id: number;
  urutan: number;
  slug: string;
  nama: string;
  namaArab: string;
  gelar: string | null;
  periode: string | null;
  ringkasan: string;
  kisah: string;
  ayatRujukan: AyatRuj[] | null;
}

interface FormState {
  id: number;
  nama: string;
  namaArab: string;
  gelar: string;
  periode: string;
  ringkasan: string;
  kisah: string;
  ayatRujukan: AyatRuj[];
}

function toForm(n: Nabi): FormState {
  return {
    id: n.id,
    nama: n.nama,
    namaArab: n.namaArab,
    gelar: n.gelar ?? "",
    periode: n.periode ?? "",
    ringkasan: n.ringkasan,
    kisah: n.kisah,
    ayatRujukan: n.ayatRujukan ?? [],
  };
}

export default function AdminNabiPage() {
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<Nabi[]>(
    "/admin/content/nabi",
    fetcher,
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      const payload = {
        nama: editing.nama.trim(),
        namaArab: editing.namaArab.trim(),
        gelar: editing.gelar.trim() || null,
        periode: editing.periode.trim() || null,
        ringkasan: editing.ringkasan.trim(),
        kisah: editing.kisah.trim(),
        ayatRujukan: editing.ayatRujukan
          .filter((r) => r.surah && r.ayat)
          .map((r) => ({
            surah: r.surah,
            ayat: r.ayat,
            catatan: r.catatan?.trim() || null,
          })),
      };
      await apiFetch(`/admin/content/nabi/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setEditing(null);
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kisah 25 Nabi"
        description="25 nabi (urutan tetap). Editor untuk teks kisah, gelar, periode, dan ayat rujukan."
      />

      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading && <Spinner label="Memuat…" />}

      {!isLoading && rows.length === 0 && (
        <EmptyState
          icon={Users}
          title="Tabel nabi kosong"
          description="Restart API untuk auto-seed 25 nabi."
        />
      )}

      <ul className="grid sm:grid-cols-2 gap-3">
        {rows.map((n) => (
          <li key={n.id} className="card p-4 flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-100 text-amber-700 font-bold shrink-0">
              {n.urutan}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                {n.nama}
                <span className="arabic text-base text-emerald-700">
                  {n.namaArab}
                </span>
              </h3>
              {n.gelar && (
                <p className="text-xs text-amber-700 mt-0.5">{n.gelar}</p>
              )}
              {n.periode && (
                <p className="text-xs text-slate-400 mt-0.5">{n.periode}</p>
              )}
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {n.ringkasan}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Link
                href={`/nabi/${n.slug}`}
                target="_blank"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <ExternalLink size={14} />
              </Link>
              <button
                onClick={() => setEditing(toForm(n))}
                className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50"
              >
                <Pencil size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <form
            onSubmit={save}
            className="card w-full max-w-3xl p-6 my-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Edit Nabi #{editing.id}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Nama *
                </span>
                <input
                  required
                  value={editing.nama}
                  onChange={(e) =>
                    setEditing((s) => (s ? { ...s, nama: e.target.value } : s))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Nama Arab *
                </span>
                <input
                  required
                  value={editing.namaArab}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, namaArab: e.target.value } : s,
                    )
                  }
                  className="arabic w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-right"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Gelar
                </span>
                <input
                  value={editing.gelar}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, gelar: e.target.value } : s,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Periode
                </span>
                <input
                  value={editing.periode}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, periode: e.target.value } : s,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Ringkasan (untuk list) *
              </span>
              <textarea
                required
                value={editing.ringkasan}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, ringkasan: e.target.value } : s,
                  )
                }
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Kisah lengkap *
              </span>
              <textarea
                required
                value={editing.kisah}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, kisah: e.target.value } : s,
                  )
                }
                rows={14}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
                placeholder="Paragraf dipisah baris kosong."
              />
            </label>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">
                  Ayat rujukan
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditing((s) =>
                      s
                        ? {
                            ...s,
                            ayatRujukan: [
                              ...s.ayatRujukan,
                              { surah: 1, ayat: 1, catatan: "" },
                            ],
                          }
                        : s,
                    )
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <Plus size={12} /> Tambah
                </button>
              </div>
              <ul className="space-y-1.5">
                {editing.ayatRujukan.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-mono">Q.S.</span>
                    <input
                      type="number"
                      min={1}
                      max={114}
                      value={r.surah}
                      onChange={(e) =>
                        setEditing((s) => {
                          if (!s) return s;
                          const next = [...s.ayatRujukan];
                          next[i] = {
                            ...next[i],
                            surah: parseInt(e.target.value || "1", 10),
                          };
                          return { ...s, ayatRujukan: next };
                        })
                      }
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <span className="text-slate-400">:</span>
                    <input
                      type="number"
                      min={1}
                      value={r.ayat}
                      onChange={(e) =>
                        setEditing((s) => {
                          if (!s) return s;
                          const next = [...s.ayatRujukan];
                          next[i] = {
                            ...next[i],
                            ayat: parseInt(e.target.value || "1", 10),
                          };
                          return { ...s, ayatRujukan: next };
                        })
                      }
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <input
                      value={r.catatan ?? ""}
                      onChange={(e) =>
                        setEditing((s) => {
                          if (!s) return s;
                          const next = [...s.ayatRujukan];
                          next[i] = { ...next[i], catatan: e.target.value };
                          return { ...s, ayatRujukan: next };
                        })
                      }
                      placeholder="Catatan singkat"
                      className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditing((s) =>
                          s
                            ? {
                                ...s,
                                ayatRujukan: s.ayatRujukan.filter((_, j) => j !== i),
                              }
                            : s,
                        )
                      }
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
                {editing.ayatRujukan.length === 0 && (
                  <li className="text-xs text-slate-400">Belum ada rujukan.</li>
                )}
              </ul>
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
                Simpan
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
