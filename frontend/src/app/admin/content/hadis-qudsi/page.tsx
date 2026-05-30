"use client";

import {
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcherFull } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface HQ {
  id: number;
  nomor: number;
  judul: string | null;
  arab: string;
  terjemahan: string;
  sumber: string | null;
  kitab: string | null;
}

interface FormState {
  id?: number;
  nomor: number;
  judul: string;
  arab: string;
  terjemahan: string;
  sumber: string;
  kitab: string;
}

const EMPTY: FormState = {
  nomor: 1,
  judul: "",
  arab: "",
  terjemahan: "",
  sumber: "",
  kitab: "",
};

function toForm(h: HQ): FormState {
  return {
    id: h.id,
    nomor: h.nomor,
    judul: h.judul ?? "",
    arab: h.arab,
    terjemahan: h.terjemahan,
    sumber: h.sumber ?? "",
    kitab: h.kitab ?? "",
  };
}

export default function AdminHadisQudsiPage() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<HQ | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(debouncedQ ? { q: debouncedQ } : {}),
  });
  const { data, error, isLoading, mutate } = useSWR(
    `/admin/content/hadis-qudsi?${params.toString()}`,
    fetcherFull<HQ[]>,
    { keepPreviousData: true },
  );

  // Suggest next nomor when creating: 1 above the highest existing.
  const { data: allCount } = useSWR(
    "/admin/content/hadis-qudsi?page=1&limit=1",
    fetcherFull<HQ[]>,
  );
  const suggestedNomor = (allCount?.meta?.total ?? 0) + 1;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      const payload = {
        nomor: editing.nomor,
        judul: editing.judul.trim() || null,
        arab: editing.arab.trim(),
        terjemahan: editing.terjemahan.trim(),
        sumber: editing.sumber.trim() || null,
        kitab: editing.kitab.trim() || null,
      };
      if (editing.id) {
        await apiFetch(`/admin/content/hadis-qudsi/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/content/hadis-qudsi", {
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
    const h = toDelete;
    if (!h) return;
    setToDelete(null);
    try {
      await apiFetch(`/admin/content/hadis-qudsi/${h.id}`, {
        method: "DELETE",
      });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal hapus");
    }
  }

  const rows = data?.data ?? [];
  const total = data?.meta?.total;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hadis Qudsi"
        description={
          typeof total === "number"
            ? `${total.toLocaleString("id-ID")} hadis qudsi tersimpan`
            : "Kelola koleksi hadis qudsi."
        }
        action={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setEditing({ ...EMPTY, nomor: suggestedNomor })}
          >
            Hadis baru
          </Button>
        }
      />

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={16}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul / terjemahan…"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm"
        />
      </div>

      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading && <Spinner label="Memuat…" />}

      {!isLoading && rows.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="Belum ada hadis qudsi"
          description="Klik 'Hadis baru' untuk menambah."
        />
      )}

      <ul className="space-y-3">
        {rows.map((h) => (
          <li key={h.id} className="card p-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs shrink-0">
                {h.nomor}
              </span>
              <div className="min-w-0 flex-1">
                {h.judul && (
                  <h3 className="font-semibold text-slate-900">{h.judul}</h3>
                )}
                <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">
                  {h.terjemahan}
                </p>
                <p className="arabic text-base text-slate-500 line-clamp-1 mt-0.5 text-right">
                  {h.arab}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {h.sumber}
                  {h.kitab && <> · {h.kitab}</>}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Link
                  href={`/hadis-qudsi#${h.nomor}`}
                  target="_blank"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                  title="Buka publik"
                >
                  <ExternalLink size={16} />
                </Link>
                <button
                  onClick={() => setEditing(toForm(h))}
                  className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50"
                  title="Edit"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setToDelete(h)}
                  className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                  title="Hapus"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {typeof total === "number" && total > 20 && (
        <Pagination
          page={page}
          totalPages={Math.ceil(total / 20)}
          total={total}
          hasMore={page < Math.ceil(total / 20)}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <form
            onSubmit={save}
            className="card w-full max-w-2xl p-6 my-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing.id ? "Edit hadis qudsi" : "Hadis qudsi baru"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Nomor *
                </span>
                <input
                  required
                  type="number"
                  min={1}
                  max={999}
                  value={editing.nomor}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, nomor: parseInt(e.target.value || "1", 10) } : s,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-slate-700">
                  Judul (opsional)
                </span>
                <input
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
              <span className="text-xs font-semibold text-slate-700">
                Teks Arab *
              </span>
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
                Terjemahan *
              </span>
              <textarea
                required
                value={editing.terjemahan}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, terjemahan: e.target.value } : s,
                  )
                }
                rows={5}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Sumber
                </span>
                <input
                  value={editing.sumber}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, sumber: e.target.value } : s,
                    )
                  }
                  placeholder="HR. Bukhari"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Kitab koleksi
                </span>
                <input
                  value={editing.kitab}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, kitab: e.target.value } : s,
                    )
                  }
                  placeholder="Arba'in Qudsiyah"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
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
        title="Hapus hadis qudsi?"
        message={
          toDelete
            ? `Hadis #${toDelete.nomor} akan dihapus permanen.`
            : ""
        }
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
