"use client";

import {
  BookOpen,
  ExternalLink,
  Pencil,
  Plus,
  Search,
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

interface Sirah {
  id: number;
  slug: string;
  judul: string;
  urutan: number;
  periode: string | null;
  isi: string;
}

interface FormState {
  id?: number;
  slug: string;
  judul: string;
  urutan: number;
  periode: string;
  isi: string;
}

const EMPTY: FormState = {
  slug: "",
  judul: "",
  urutan: 1,
  periode: "",
  isi: "",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toForm(s: Sirah): FormState {
  return {
    id: s.id,
    slug: s.slug,
    judul: s.judul,
    urutan: s.urutan,
    periode: s.periode ?? "",
    isi: s.isi,
  };
}

export default function AdminSirahPage() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Sirah | null>(null);

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
    `/admin/content/sirah?${params.toString()}`,
    fetcherFull<Sirah[]>,
    { keepPreviousData: true },
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      const payload = {
        slug: editing.slug.trim(),
        judul: editing.judul.trim(),
        urutan: editing.urutan,
        periode: editing.periode.trim() || null,
        isi: editing.isi.trim(),
      };
      if (editing.id) {
        await apiFetch(`/admin/content/sirah/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/content/sirah", {
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
    const s = toDelete;
    if (!s) return;
    setToDelete(null);
    try {
      await apiFetch(`/admin/content/sirah/${s.id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal hapus");
    }
  }

  const rows = data?.data ?? [];
  const total = data?.meta?.total;
  const suggestedUrutan = rows.length > 0
    ? Math.max(...rows.map((r) => r.urutan)) + 1
    : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sirah Nabawi"
        description={
          typeof total === "number"
            ? `${total.toLocaleString("id-ID")} bab sirah`
            : "Kelola bab-bab sirah Nabi ﷺ."
        }
        action={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() =>
              setEditing({ ...EMPTY, urutan: suggestedUrutan })
            }
          >
            Bab baru
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
          placeholder="Cari judul…"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm"
        />
      </div>

      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading && <Spinner label="Memuat…" />}

      {!isLoading && rows.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="Belum ada bab sirah"
          description="Klik 'Bab baru' untuk menambah."
        />
      )}

      <ul className="space-y-3">
        {rows.map((s) => (
          <li
            key={s.id}
            className="card p-4 flex items-start gap-3"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold shrink-0">
              {s.urutan}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900 truncate">
                {s.judul}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                <span className="font-mono">{s.slug}</span>
                {s.periode && <> · {s.periode}</>}
              </p>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                {s.isi.slice(0, 200)}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={`/sirah/${s.slug}`}
                target="_blank"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <ExternalLink size={16} />
              </Link>
              <button
                onClick={() => setEditing(toForm(s))}
                className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => setToDelete(s)}
                className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={16} />
              </button>
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
            className="card w-full max-w-3xl p-6 my-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing.id ? "Edit bab sirah" : "Bab sirah baru"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid sm:grid-cols-[1fr_120px] gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Judul bab *
                </span>
                <input
                  required
                  value={editing.judul}
                  onChange={(e) => {
                    const judul = e.target.value;
                    setEditing((s) =>
                      s
                        ? {
                            ...s,
                            judul,
                            slug: s.id ? s.slug : slugify(judul),
                          }
                        : s,
                    );
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
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
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Slug *
                </span>
                <input
                  required
                  pattern="[a-z0-9-]+"
                  value={editing.slug}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, slug: slugify(e.target.value) } : s,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Periode (opsional)
                </span>
                <input
                  value={editing.periode}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, periode: e.target.value } : s,
                    )
                  }
                  placeholder="Makkah / Madinah / dll"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Isi bab *
              </span>
              <textarea
                required
                value={editing.isi}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, isi: e.target.value } : s))
                }
                rows={16}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
                placeholder="Markdown ringan: **tebal**, *miring*. Paragraf dipisah baris kosong."
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
                {editing.id ? "Simpan" : "Buat"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus bab sirah?"
        message={
          toDelete ? `Bab "${toDelete.judul}" akan dihapus permanen.` : ""
        }
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
