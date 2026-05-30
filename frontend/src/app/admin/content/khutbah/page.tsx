"use client";

import {
  BookOpen,
  Calendar,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Tag as TagIcon,
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

interface Khutbah {
  id: number;
  slug: string;
  judul: string;
  tema: string | null;
  tanggal: string | null;
  pembuka: string | null;
  isi: string;
  penutup: string | null;
  sumber: string | null;
}

interface FormState {
  id?: number;
  slug: string;
  judul: string;
  tema: string;
  tanggal: string;
  pembuka: string;
  isi: string;
  penutup: string;
  sumber: string;
}

const EMPTY: FormState = {
  slug: "",
  judul: "",
  tema: "",
  tanggal: "",
  pembuka: "",
  isi: "",
  penutup: "",
  sumber: "",
};

function toForm(k: Khutbah): FormState {
  return {
    id: k.id,
    slug: k.slug,
    judul: k.judul,
    tema: k.tema ?? "",
    tanggal: k.tanggal ? k.tanggal.slice(0, 10) : "",
    pembuka: k.pembuka ?? "",
    isi: k.isi,
    penutup: k.penutup ?? "",
    sumber: k.sumber ?? "",
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function AdminKhutbahPage() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Khutbah | null>(null);

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
    `/admin/content/khutbah?${params.toString()}`,
    fetcherFull<Khutbah[]>,
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
        tema: editing.tema.trim() || null,
        tanggal: editing.tanggal || null,
        pembuka: editing.pembuka.trim() || null,
        isi: editing.isi.trim(),
        penutup: editing.penutup.trim() || null,
        sumber: editing.sumber.trim() || null,
      };
      if (editing.id) {
        await apiFetch(`/admin/content/khutbah/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/content/khutbah", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setPage(1);
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
    const k = toDelete;
    if (!k) return;
    setToDelete(null);
    try {
      await apiFetch(`/admin/content/khutbah/${k.id}`, { method: "DELETE" });
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
        title="Khutbah Jumat"
        description={
          typeof total === "number"
            ? `${total.toLocaleString("id-ID")} khutbah tersimpan`
            : "Kelola arsip khutbah Jumat."
        }
        action={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setEditing({ ...EMPTY })}
          >
            Khutbah baru
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
          placeholder="Cari judul / tema…"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm"
        />
      </div>

      {error && <ErrorBox message={(error as Error).message} />}
      {isLoading && <Spinner label="Memuat…" />}

      {!isLoading && rows.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="Belum ada khutbah"
          description="Klik 'Khutbah baru' untuk menambah."
        />
      )}

      <ul className="space-y-3">
        {rows.map((k) => (
          <li
            key={k.id}
            className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900 truncate">
                {k.judul}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                <span className="font-mono">{k.slug}</span>
                {k.tema && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 capitalize">
                    <TagIcon size={10} /> {k.tema}
                  </span>
                )}
                {k.tanggal && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={10} />
                    {new Date(k.tanggal).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
                {k.sumber && <span>· {k.sumber}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={`/khutbah/${k.slug}`}
                target="_blank"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                title="Buka di tab baru"
              >
                <ExternalLink size={16} />
              </Link>
              <button
                onClick={() => setEditing(toForm(k))}
                className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50"
                title="Edit"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => setToDelete(k)}
                className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                title="Hapus"
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

      {/* Modal form */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
          <form
            onSubmit={save}
            className="card w-full max-w-3xl p-6 my-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {editing.id ? "Edit khutbah" : "Khutbah baru"}
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
                  Judul *
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
                  Slug *
                </span>
                <input
                  required
                  value={editing.slug}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, slug: slugify(e.target.value) } : s,
                    )
                  }
                  pattern="[a-z0-9-]+"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Tema
                </span>
                <input
                  value={editing.tema}
                  onChange={(e) =>
                    setEditing((s) => (s ? { ...s, tema: e.target.value } : s))
                  }
                  placeholder="akhlak / iman / fiqih"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Tanggal khutbah
                </span>
                <input
                  type="date"
                  value={editing.tanggal}
                  onChange={(e) =>
                    setEditing((s) =>
                      s ? { ...s, tanggal: e.target.value } : s,
                    )
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
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
                  placeholder="Nama khatib / referensi"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Pembuka
              </span>
              <textarea
                value={editing.pembuka}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, pembuka: e.target.value } : s,
                  )
                }
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Isi khutbah *
              </span>
              <textarea
                required
                value={editing.isi}
                onChange={(e) =>
                  setEditing((s) => (s ? { ...s, isi: e.target.value } : s))
                }
                rows={12}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
                placeholder="Mendukung markdown ringan: **tebal** dan *miring*. Pisahkan paragraf dengan baris kosong."
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Penutup
              </span>
              <textarea
                value={editing.penutup}
                onChange={(e) =>
                  setEditing((s) =>
                    s ? { ...s, penutup: e.target.value } : s,
                  )
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
                {editing.id ? "Simpan" : "Buat"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus khutbah?"
        message={
          toDelete
            ? `Khutbah "${toDelete.judul}" akan dihapus permanen.`
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
