"use client";

import {
  ExternalLink,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface Topic {
  id: number;
  slug: string;
  nama: string;
  deskripsi: string | null;
  urutan: number;
  _count: { ayatLinks: number };
}

interface FormState {
  id?: number;
  slug: string;
  nama: string;
  deskripsi: string;
  urutan: string; // kept as string so the input can be cleared while typing
}

const EMPTY: FormState = { slug: "", nama: "", deskripsi: "", urutan: "100" };

function toForm(t: Topic): FormState {
  return {
    id: t.id,
    slug: t.slug,
    nama: t.nama,
    deskripsi: t.deskripsi ?? "",
    urutan: String(t.urutan),
  };
}

export default function AdminTopicPage() {
  const [editing, setEditing] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Topic | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { data, error, isLoading, mutate } = useSWR<Topic[]>(
    "/admin/content/topic",
    fetcher,
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      // Empty → default 100, but keep an explicit 0 (valid "pin to top").
      const parsedUrutan =
        editing.urutan.trim() === "" ? 100 : Number(editing.urutan);
      const payload = {
        slug: editing.slug.toLowerCase().trim(),
        nama: editing.nama.trim(),
        deskripsi: editing.deskripsi.trim() || null,
        urutan: Number.isFinite(parsedUrutan) ? parsedUrutan : 100,
      };
      if (editing.id) {
        await apiFetch(`/admin/content/topic/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/admin/content/topic", {
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
    setDeletingId(t.id);
    try {
      await apiFetch(`/admin/content/topic/${t.id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setDeletingId(null);
    }
  }

  const all = data ?? [];
  const q = search.trim().toLowerCase();
  const rows = (q
    ? all.filter(
        (t) =>
          t.nama.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
      )
    : all
  )
    .slice()
    .sort((a, b) => a.urutan - b.urutan || a.nama.localeCompare(b.nama));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Topik"
        description={
          data
            ? `${all.length} tema. Kelompokkan ayat per tema (sabar, syukur, …).`
            : "Browse-by-theme — kelompokkan ayat per tema."
        }
        action={
          <Button icon={<Plus size={16} />} onClick={() => setEditing({ ...EMPTY })}>
            Topik baru
          </Button>
        }
      />

      <BatchAiActions onDone={() => mutate()} />

      {/* Search (client-side — the full list is loaded at once) */}
      {all.length > 0 && (
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau slug…"
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
      )}

      {isLoading && <Spinner label="Memuat…" />}
      {error && <ErrorBox message={error.message} />}

      {data && all.length === 0 && (
        <EmptyState
          icon={Tag}
          title="Belum ada topik"
          description="Klik 'Topik baru' untuk membuat tema (sabar, syukur, …) lalu hubungkan dengan ayat."
        />
      )}

      {data && all.length > 0 && rows.length === 0 && (
        <EmptyState
          icon={Search}
          title="Tidak ditemukan"
          description={`Tidak ada topik cocok dengan "${search}".`}
        />
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((t) => (
            <div
              key={t.id}
              className={`card p-4 flex flex-col ${
                deletingId === t.id ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">
                    {t.nama}
                  </h3>
                  <p className="text-xs font-mono text-slate-500 truncate">
                    /{t.slug}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 tabular-nums">
                  #{t.urutan}
                </span>
              </div>

              {t.deskripsi && (
                <p className="text-xs text-slate-600 mt-2 line-clamp-2">
                  {t.deskripsi}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
                <Link
                  href={`/admin/content/topic/${t.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  <ListTree size={14} />
                  {t._count.ayatLinks} ayat
                </Link>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/topic/${t.slug}`}
                    target="_blank"
                    aria-label="Buka di app"
                    title="Buka di app"
                    className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <ExternalLink size={15} />
                  </Link>
                  <button
                    onClick={() => setEditing(toForm(t))}
                    aria-label="Edit topik"
                    title="Edit"
                    className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Pencil size={15} />
                  </button>
                  <TopicAiActions
                    slug={t.slug}
                    onDone={() => mutate()}
                  />
                  <button
                    onClick={() => setToDelete(t)}
                    disabled={deletingId === t.id}
                    aria-label="Hapus topik"
                    title="Hapus"
                    className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TopicFormModal
          state={editing}
          setState={setEditing}
          onSubmit={save}
          busy={busy}
          onClose={() => !busy && setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus topik?"
        message={
          toDelete
            ? `"${toDelete.nama}" akan dihapus permanen beserta ${toDelete._count.ayatLinks} mapping ayat. Tidak bisa dibatalkan.`
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

const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
        {required && <span className="text-rose-500"> *</span>}
        {hint && <span className="font-normal text-slate-400"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function TopicFormModal({
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
      aria-label={state.id ? "Edit topik" : "Topik baru"}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={onSubmit}
        className="relative my-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">
            {state.id ? `Edit topik #${state.id}` : "Topik baru"}
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

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <Field label="Nama" required>
            <input
              ref={firstFieldRef}
              placeholder="mis. Sabar"
              value={state.nama}
              onChange={(e) => setState({ ...state, nama: e.target.value })}
              required
              maxLength={120}
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Slug" required hint="url topik">
                <input
                  placeholder="sabar"
                  value={state.slug}
                  onChange={(e) =>
                    setState({
                      ...state,
                      slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    })
                  }
                  required
                  pattern="[a-z0-9-]+"
                  title="Huruf kecil, angka, dan tanda minus saja"
                  maxLength={80}
                  className={`${INPUT} font-mono`}
                />
              </Field>
            </div>
            <Field label="Urutan" hint="kecil=atas">
              <input
                type="number"
                inputMode="numeric"
                placeholder="100"
                value={state.urutan}
                onChange={(e) => setState({ ...state, urutan: e.target.value })}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Deskripsi">
            <textarea
              placeholder="Penjelasan singkat tema (opsional)"
              rows={3}
              value={state.deskripsi}
              onChange={(e) => setState({ ...state, deskripsi: e.target.value })}
              className={INPUT}
            />
          </Field>
        </div>

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

// ─── AI helpers ────────────────────────────────────────────────────────

function BatchAiActions({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function runExpandAll() {
    if (
      !confirm(
        "Auto-expand SEMUA topik dengan AI? Akan ada call OpenAI per topik (estimasi <$0.02 total).",
      )
    )
      return;
    setBusy("expand");
    setResult(null);
    try {
      const env = await apiFetch<{
        topicsProcessed: number;
        totalAdded: number;
      }>("/admin/content/topic/ai/expand-all", { method: "POST" });
      setResult(
        `Expand all: ${env.data.topicsProcessed} topik, ${env.data.totalAdded} ayat AI ditambah.`,
      );
      onDone();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Gagal");
    } finally {
      setBusy(null);
    }
  }

  async function runSummaryAll() {
    if (
      !confirm(
        "Regenerate AI summary untuk SEMUA topik? Akan ada call GPT-4o-mini per topik (estimasi <$0.05 total).",
      )
    )
      return;
    setBusy("summary");
    setResult(null);
    try {
      const env = await apiFetch<{
        processed: number;
        successful: number;
      }>("/admin/content/topic/ai/summary-all", { method: "POST" });
      setResult(
        `Summary all: ${env.data.successful}/${env.data.processed} sukses.`,
      );
      onDone();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Gagal");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-4 bg-gradient-to-br from-sky-50 to-indigo-50 border-sky-100">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-indigo-700" />
        <h2 className="font-semibold text-slate-900">Batch AI actions</h2>
      </div>
      <p className="text-xs text-slate-600 mb-3 leading-relaxed">
        Jalankan untuk semua topik sekaligus. Idempotent dan aman dijalankan
        ulang. Tetap butuh API key OpenAI di{" "}
        <Link
          href="/admin/settings/ai"
          className="underline text-indigo-700 font-semibold"
        >
          /admin/settings/ai
        </Link>
        .
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          icon={<Wand2 size={14} />}
          onClick={runExpandAll}
          loading={busy === "expand"}
          disabled={busy !== null}
        >
          Auto-expand semua
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={<Zap size={14} />}
          onClick={runSummaryAll}
          loading={busy === "summary"}
          disabled={busy !== null}
        >
          Regenerate summary semua
        </Button>
      </div>
      {result && (
        <p className="mt-3 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2">
          {result}
        </p>
      )}
    </section>
  );
}

function TopicAiActions({
  slug,
  onDone,
}: {
  slug: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: "summary" | "expand" | "plan") {
    if (busy) return;
    setBusy(action);
    try {
      const env = await apiFetch<{
        added?: number;
        plan?: unknown[];
        aiSummary?: string;
      }>(`/admin/content/topic/${slug}/ai/${action}`, { method: "POST" });
      const msg =
        action === "summary"
          ? "Summary diperbarui."
          : action === "expand"
            ? `+${env.data.added ?? 0} ayat AI.`
            : `Rencana ${env.data.plan?.length ?? 0} hari dibuat.`;
      alert(msg);
      onDone();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        onClick={() => run("summary")}
        disabled={busy !== null}
        aria-label="Generate AI summary"
        title="Generate AI summary"
        className="grid h-9 w-9 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
      >
        {busy === "summary" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Zap size={15} />
        )}
      </button>
      <button
        onClick={() => run("expand")}
        disabled={busy !== null}
        aria-label="Auto-expand dengan AI"
        title="Auto-expand ayat AI"
        className="grid h-9 w-9 place-items-center rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
      >
        {busy === "expand" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Sparkles size={15} />
        )}
      </button>
      <button
        onClick={() => run("plan")}
        disabled={busy !== null}
        aria-label="Generate rencana baca"
        title="Generate rencana baca 7 hari"
        className="grid h-9 w-9 place-items-center rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
      >
        {busy === "plan" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Wand2 size={15} />
        )}
      </button>
    </>
  );
}
