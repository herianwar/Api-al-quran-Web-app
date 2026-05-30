"use client";

import { ExternalLink, Pencil, ScrollText, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface Niat {
  id: number;
  slug: string;
  nama: string;
  arab: string;
  latin: string;
  arti: string;
  urutan: number;
}

interface FormState {
  id: number;
  nama: string;
  arab: string;
  latin: string;
  arti: string;
}

function toForm(n: Niat): FormState {
  return {
    id: n.id,
    nama: n.nama,
    arab: n.arab,
    latin: n.latin,
    arti: n.arti,
  };
}

export default function AdminNiatShalatPage() {
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<Niat[]>(
    "/admin/content/niat-shalat",
    fetcher,
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/content/niat-shalat/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nama: editing.nama.trim(),
          arab: editing.arab.trim(),
          latin: editing.latin.trim(),
          arti: editing.arti.trim(),
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

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Niat Shalat Fardhu"
        description="5 niat shalat wajib (Subuh-Isya). Slug & urutan tidak editable; isi teks Arab/latin/arti dapat diperbaiki."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Tabel niat shalat kosong"
          description="Jalankan seed `niat_shalat` di Seed Control."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((n) => (
            <li key={n.id} className="card p-4 flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold shrink-0">
                {n.urutan}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-900">{n.nama}</h3>
                <p className="arabic text-base text-slate-700 line-clamp-1 mt-0.5 text-right">
                  {n.arab}
                </p>
                <p className="text-xs italic text-slate-500 line-clamp-1 mt-0.5">
                  {n.latin}
                </p>
                <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                  {n.arti}
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Link
                  href={`/shalat/niat#${n.slug}`}
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
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <form
            onSubmit={save}
            className="card w-full max-w-2xl p-6 my-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit niat shalat</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">Nama</span>
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
                rows={3}
                className="arabic w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-right leading-loose"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Latin
              </span>
              <textarea
                required
                value={editing.latin}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, latin: e.target.value } : s))
                }
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm italic"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">Arti</span>
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
