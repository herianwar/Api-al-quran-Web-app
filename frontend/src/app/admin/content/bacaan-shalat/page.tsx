"use client";

import { ExternalLink, Pencil, ScrollText, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface Bacaan {
  id: number;
  gerakan: number;
  varian: number;
  nama: string;
  arab: string;
  latin: string;
  arti: string;
}

interface FormState {
  id: number;
  nama: string;
  arab: string;
  latin: string;
  arti: string;
}

function toForm(b: Bacaan): FormState {
  return {
    id: b.id,
    nama: b.nama,
    arab: b.arab,
    latin: b.latin,
    arti: b.arti,
  };
}

export default function AdminBacaanShalatPage() {
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<Bacaan[]>(
    "/admin/content/bacaan-shalat",
    fetcher,
  );

  const grouped = useMemo(() => {
    if (!data) return [];
    const g: Record<number, Bacaan[]> = {};
    for (const r of data) {
      (g[r.gerakan] ?? (g[r.gerakan] = [])).push(r);
    }
    return Object.entries(g)
      .map(([k, items]) => ({ gerakan: Number(k), items }))
      .sort((a, b) => a.gerakan - b.gerakan);
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/content/bacaan-shalat/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nama: editing.nama.trim(),
          arab: editing.arab.trim(),
          latin: editing.latin.trim() || null,
          arti: editing.arti.trim() || null,
        }),
      });
      setEditing(null);
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading && !data) return <Spinner label="Memuat…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bacaan Shalat per Gerakan"
        description="Tata cara shalat: 10 gerakan dengan bacaan masing-masing. Edit teks tanpa mengubah urutan gerakan/varian."
      />

      {grouped.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Tabel bacaan shalat kosong"
          description="Jalankan seed `bacaan_shalat` di Seed Control."
        />
      ) : (
        <ul className="space-y-4">
          {grouped.map((g) => (
            <li key={g.gerakan} className="card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                  {g.gerakan}
                </span>
                <h3 className="font-semibold text-slate-900">
                  {g.items[0]?.nama}
                </h3>
                {g.items.length > 1 && (
                  <span className="text-xs text-slate-500 ml-auto">
                    {g.items.length} bacaan
                  </span>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {g.items.map((b) => (
                  <li
                    key={b.id}
                    className="py-2 flex items-start gap-2"
                  >
                    {g.items.length > 1 && (
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1 shrink-0">
                        #{b.varian}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="arabic text-base text-slate-700 line-clamp-1 text-right">
                        {b.arab}
                      </p>
                      {b.latin && (
                        <p className="text-xs italic text-slate-500 line-clamp-1 mt-0.5">
                          {b.latin}
                        </p>
                      )}
                      {b.arti && (
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {b.arti}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setEditing(toForm(b))}
                      className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 shrink-0"
                    >
                      <Pencil size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/shalat/bacaan"
        target="_blank"
        className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800"
      >
        <ExternalLink size={11} /> Buka halaman publik
      </Link>

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <form
            onSubmit={save}
            className="card w-full max-w-2xl p-6 my-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit bacaan shalat</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Nama gerakan
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

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">Arab</span>
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
                Latin
              </span>
              <textarea
                value={editing.latin}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, latin: e.target.value } : s))
                }
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm italic"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">Arti</span>
              <textarea
                value={editing.arti}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, arti: e.target.value } : s))
                }
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

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
