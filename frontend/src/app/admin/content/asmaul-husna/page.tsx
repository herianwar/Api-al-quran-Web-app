"use client";

import { ExternalLink, Pencil, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface Asma {
  id: number;
  arab: string;
  latin: string;
  arti: string;
  penjelasan: string | null;
  dalil: string | null;
  faidah: string | null;
}

interface FormState {
  id: number;
  arab: string;
  latin: string;
  arti: string;
  penjelasan: string;
  dalil: string;
  faidah: string;
}

function toForm(a: Asma): FormState {
  return {
    id: a.id,
    arab: a.arab,
    latin: a.latin,
    arti: a.arti,
    penjelasan: a.penjelasan ?? "",
    dalil: a.dalil ?? "",
    faidah: a.faidah ?? "",
  };
}

export default function AdminAsmaulHusnaPage() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<Asma[]>(
    "/admin/content/asmaul-husna",
    fetcher,
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (a) =>
        a.latin.toLowerCase().includes(q) ||
        a.arti.toLowerCase().includes(q) ||
        String(a.id) === q,
    );
  }, [data, query]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      const payload = {
        penjelasan: editing.penjelasan.trim() || null,
        dalil: editing.dalil.trim() || null,
        faidah: editing.faidah.trim() || null,
      };
      await apiFetch(`/admin/content/asmaul-husna/${editing.id}`, {
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asmaul Husna (detail)"
        description="99 nama Allah (urutan tetap). Penjelasan, dalil, dan faidah dapat di-edit."
      />

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={16}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama / arti / nomor…"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm"
        />
      </div>

      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading && <Spinner label="Memuat…" />}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="Tidak ada nama yang cocok"
          description="Coba kata kunci lain."
        />
      )}

      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((a) => {
          const incomplete = !a.penjelasan || !a.dalil || !a.faidah;
          return (
            <li
              key={a.id}
              className={`card p-4 flex items-start gap-3 ${
                incomplete ? "ring-1 ring-amber-200" : ""
              }`}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-100 text-amber-700 font-bold text-xs shrink-0">
                {a.id}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-900 flex items-baseline gap-2">
                  {a.latin}
                  <span className="arabic text-lg text-emerald-700">
                    {a.arab}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                  {a.arti}
                </p>
                <p className="text-xs mt-1 flex flex-wrap gap-2">
                  <span
                    className={
                      a.penjelasan ? "text-emerald-600" : "text-amber-600"
                    }
                  >
                    {a.penjelasan ? "✓" : "○"} penjelasan
                  </span>
                  <span
                    className={a.dalil ? "text-emerald-600" : "text-amber-600"}
                  >
                    {a.dalil ? "✓" : "○"} dalil
                  </span>
                  <span
                    className={a.faidah ? "text-emerald-600" : "text-amber-600"}
                  >
                    {a.faidah ? "✓" : "○"} faidah
                  </span>
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Link
                  href={`/asmaul-husna/${a.id}`}
                  target="_blank"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <ExternalLink size={14} />
                </Link>
                <button
                  onClick={() => setEditing(toForm(a))}
                  className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <form
            onSubmit={save}
            className="card w-full max-w-2xl p-6 my-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-baseline gap-2">
                <span className="text-amber-700 font-bold">#{editing.id}</span>
                {editing.latin}
                <span className="arabic text-base text-emerald-700">
                  {editing.arab}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Arab, latin, dan arti tidak editable.
            </p>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Penjelasan (1-2 paragraf)
              </span>
              <textarea
                value={editing.penjelasan}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, penjelasan: e.target.value } : s,
                  )
                }
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Dalil (contoh: Q.S. Al-Hashr ayat 22-24)
              </span>
              <input
                value={editing.dalil}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, dalil: e.target.value } : s,
                  )
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Faidah / hikmah penerapan
              </span>
              <textarea
                value={editing.faidah}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, faidah: e.target.value } : s,
                  )
                }
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
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
