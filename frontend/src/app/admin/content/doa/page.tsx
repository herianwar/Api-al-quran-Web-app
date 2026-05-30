"use client";

import {
  Copy,
  Check,
  Pencil,
  Plus,
  ScrollText,
  Search,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcherFull } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Pagination } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface Doa {
  id: number;
  judul: string;
  arab: string;
  latin: string;
  terjemah: string;
  sumber: string | null;
  grup: string | null;
  tag: string | null;
}

interface FormState {
  id?: number;
  judul: string;
  arab: string;
  latin: string;
  terjemah: string;
  sumber: string;
  grup: string;
  tag: string;
}

const EMPTY: FormState = {
  judul: "",
  arab: "",
  latin: "",
  terjemah: "",
  sumber: "",
  grup: "",
  tag: "",
};

function toForm(d: Doa): FormState {
  return {
    id: d.id,
    judul: d.judul,
    arab: d.arab,
    latin: d.latin,
    terjemah: d.terjemah,
    sumber: d.sumber ?? "",
    grup: d.grup ?? "",
    tag: d.tag ?? "",
  };
}

export default function AdminDoaPage() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Doa | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Debounce the search box → refetch ~300ms after typing stops.
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
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/admin/content/doa?${params.toString()}`,
    fetcherFull<Doa[]>,
    { keepPreviousData: true },
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      const payload = {
        judul: editing.judul.trim(),
        arab: editing.arab.trim(),
        latin: editing.latin.trim() || null,
        terjemah: editing.terjemah.trim(),
        sumber: editing.sumber.trim() || null,
        grup: editing.grup.trim() || null,
        tag: editing.tag.trim() || null,
      };
      const creating = !editing.id;
      if (editing.id) {
        await apiFetch(`/admin/content/doa/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/content/doa", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setEditing(null);
      // New doa sorts to the top (id desc) — jump to page 1 so it's visible.
      if (creating) setPage(1);
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const d = toDelete;
    if (!d) return;
    setToDelete(null);
    setDeletingId(d.id);
    try {
      await apiFetch(`/admin/content/doa/${d.id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setDeletingId(null);
    }
  }

  const rows = data?.data ?? [];
  const total = data?.meta?.total;
  const description =
    typeof total === "number"
      ? debouncedQ
        ? `${total.toLocaleString("id-ID")} doa cocok`
        : `${total.toLocaleString("id-ID")} doa tersimpan`
      : "Kelola doa & dzikir langsung dari UI, tanpa re-seed dari JSON.";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Doa"
        description={description}
        action={
          <Button
            icon={<Plus size={16} />}
            onClick={() => setEditing({ ...EMPTY })}
          >
            Doa baru
          </Button>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari judul atau terjemah…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Bersihkan pencarian"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isLoading && !data && <Spinner label="Memuat…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={ScrollText}
          title="Belum ada doa"
          description={
            debouncedQ
              ? `Tidak ada doa cocok dengan "${debouncedQ}".`
              : "Klik 'Doa baru' atau jalankan seed doa untuk mulai."
          }
        />
      )}

      {data && rows.length > 0 && (
        <div
          className={`space-y-3 ${
            isValidating ? "opacity-60 transition-opacity" : "transition-opacity"
          }`}
        >
          {rows.map((d) => (
            <DoaCard
              key={d.id}
              doa={d}
              deleting={deletingId === d.id}
              onEdit={() => setEditing(toForm(d))}
              onDelete={() => setToDelete(d)}
            />
          ))}

          <Pagination
            page={data.meta?.page ?? 1}
            totalPages={data.meta?.totalPages ?? 1}
            total={data.meta?.total}
            hasMore={!!data.meta?.hasMore}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      {editing && (
        <DoaFormModal
          state={editing}
          setState={setEditing}
          onSubmit={save}
          busy={busy}
          onClose={() => !busy && setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus doa?"
        message={
          toDelete
            ? `"${toDelete.judul}" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`
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

function DoaCard({
  doa: d,
  deleting,
  onEdit,
  onDelete,
}: {
  doa: Doa;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyArab() {
    try {
      await navigator.clipboard.writeText(d.arab);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <div
      className={`card p-4 sm:p-5 ${deleting ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold tabular-nums text-slate-400">
              #{d.id}
            </span>
            <h3 className="font-semibold text-slate-900 leading-tight">
              {d.judul}
            </h3>
          </div>
          {(d.grup || d.tag) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {d.grup && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-semibold">
                  {d.grup}
                </span>
              )}
              {d.tag && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px] font-medium">
                  <TagIcon size={10} /> {d.tag}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={copyArab}
            aria-label="Salin teks Arab"
            title="Salin teks Arab"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            {copied ? (
              <Check size={16} className="text-emerald-600" />
            ) : (
              <Copy size={15} />
            )}
          </button>
          <button
            onClick={onEdit}
            aria-label="Edit doa"
            title="Edit"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            aria-label="Hapus doa"
            title="Hapus"
            className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <p className="arabic text-xl sm:text-2xl text-right text-slate-900 mt-3 mb-2 leading-loose">
        {d.arab}
      </p>
      {d.latin && (
        <p className="text-sm italic text-slate-500 mb-1">{d.latin}</p>
      )}
      <p className="text-sm text-slate-700 leading-relaxed">{d.terjemah}</p>
      {d.sumber && (
        <p className="text-xs text-slate-400 mt-2">— {d.sumber}</p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function DoaFormModal({
  state,
  setState,
  onSubmit,
  busy,
  onClose,
}: {
  state: FormState;
  setState: (s: FormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  onClose: () => void;
}) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  // Keep the latest onClose without making the mount effect depend on it —
  // otherwise the effect re-runs every keystroke and steals focus back to
  // the first field.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Run once on mount: ESC to close, lock background scroll, focus first field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={state.id ? "Edit doa" : "Doa baru"}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={onSubmit}
        className="relative my-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col max-h-[92vh]"
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">
            {state.id ? `Edit doa #${state.id}` : "Doa baru"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <Field label="Judul" required>
            <input
              ref={firstFieldRef}
              placeholder="mis. Doa Sebelum Makan"
              value={state.judul}
              onChange={(e) => setState({ ...state, judul: e.target.value })}
              required
              maxLength={200}
              className={INPUT}
            />
          </Field>

          <Field label="Teks Arab" required>
            <textarea
              placeholder="اكتب النص العربي هنا"
              rows={3}
              value={state.arab}
              onChange={(e) => setState({ ...state, arab: e.target.value })}
              required
              dir="rtl"
              className={`arabic ${INPUT} text-xl leading-loose`}
            />
          </Field>

          <Field label="Latin (transliterasi)">
            <input
              placeholder="mis. Allahumma barik lana"
              value={state.latin}
              onChange={(e) => setState({ ...state, latin: e.target.value })}
              className={`${INPUT} italic`}
            />
          </Field>

          <Field label="Terjemah" required>
            <textarea
              placeholder="Terjemahan Bahasa Indonesia"
              rows={3}
              value={state.terjemah}
              onChange={(e) => setState({ ...state, terjemah: e.target.value })}
              required
              className={INPUT}
            />
          </Field>

          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Sumber">
              <input
                placeholder="HR. Bukhari"
                value={state.sumber}
                onChange={(e) => setState({ ...state, sumber: e.target.value })}
                className={INPUT}
              />
            </Field>
            <Field label="Grup">
              <input
                placeholder="Doa Harian"
                value={state.grup}
                onChange={(e) => setState({ ...state, grup: e.target.value })}
                className={INPUT}
              />
            </Field>
            <Field label="Tag">
              <input
                placeholder="makan"
                value={state.tag}
                onChange={(e) => setState({ ...state, tag: e.target.value })}
                className={INPUT}
              />
            </Field>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={busy} loadingText="Menyimpan…">
            Simpan
          </Button>
        </div>
      </form>
    </div>
  );
}
