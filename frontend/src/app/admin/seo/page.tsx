"use client";

import {
  CheckCircle2,
  Eye,
  Globe,
  Pencil,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";

const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

interface SettingRow {
  key: string;
  label: string;
  category: string;
  isSecret: boolean;
  isConfigured: boolean;
  preview: string;
}

interface SeoPage {
  id: number;
  path: string;
  label: string | null;
  title: string | null;
  description: string | null;
  keywords: string | null;
  ogImage: string | null;
  ogType: string | null;
  canonical: string | null;
  noindex: boolean;
  changefreq: string | null;
  priority: number | null;
  jsonLd: string | null;
  isActive: boolean;
  updatedAt: string;
}

interface ResolvedMeta {
  path: string;
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogImage: string;
  ogType: string;
  siteName: string;
  noindex: boolean;
  jsonLd: Record<string, unknown>[] | null;
  source: "override" | "template" | "default";
}

// Logical grouping + ordering of the global SEO settings.
const GROUPS: { title: string; icon: typeof Globe; keys: string[] }[] = [
  {
    title: "Identitas situs",
    icon: Globe,
    keys: [
      "seo.site_url",
      "seo.site_name",
      "seo.default_title",
      "seo.title_template",
      "seo.default_description",
      "seo.default_keywords",
    ],
  },
  {
    title: "Open Graph & sosial",
    icon: Share2,
    keys: [
      "seo.default_og_image",
      "seo.twitter_handle",
      "seo.twitter_card",
      "seo.facebook_app_id",
      "seo.locale",
    ],
  },
  {
    title: "Verifikasi & analytics",
    icon: ShieldCheck,
    keys: [
      "seo.google_site_verification",
      "seo.bing_site_verification",
      "seo.ga_measurement_id",
      "seo.gtm_id",
    ],
  },
  {
    title: "Robots & indexing",
    icon: Search,
    keys: ["seo.robots_indexable", "seo.robots_extra"],
  },
  {
    title: "Organisasi (JSON-LD)",
    icon: Globe,
    keys: ["seo.organization_name", "seo.organization_logo"],
  },
];

const TEXTAREA_KEYS = new Set(["seo.default_description", "seo.robots_extra"]);

export default function AdminSeoPage() {
  const {
    data: rows,
    error,
    isLoading,
    mutate: mutateSettings,
  } = useSWR<SettingRow[]>("/admin/settings?category=seo", fetcher);

  const {
    data: pages,
    mutate: mutatePages,
  } = useSWR<SeoPage[]>("/admin/seo/pages", fetcher);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [previewPath, setPreviewPath] = useState("/");
  const { data: preview } = useSWR<ResolvedMeta>(
    `/admin/seo/preview?path=${encodeURIComponent(previewPath || "/")}`,
    fetcher,
    { keepPreviousData: true },
  );

  const [editing, setEditing] = useState<Partial<SeoPage> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SeoPage | null>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, SettingRow>();
    rows?.forEach((r) => m.set(r.key, r));
    return m;
  }, [rows]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2_500);
    return () => clearTimeout(t);
  }, [savedFlash]);

  function valueOf(key: string): string {
    if (key in draft) return draft[key];
    return byKey.get(key)?.preview ?? "";
  }

  function setValue(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function saveGlobals() {
    if (Object.keys(draft).length === 0 || busy) return;
    setBusy(true);
    try {
      await apiFetch("/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ values: draft }),
      });
      setDraft({});
      setSavedFlash(true);
      await mutateSettings();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  async function savePage(form: Partial<SeoPage>) {
    if (!form.path) {
      alert("Path wajib diisi (mis. /doa)");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/admin/seo/pages", {
        method: "POST",
        body: JSON.stringify({
          path: form.path,
          label: form.label || undefined,
          title: form.title || undefined,
          description: form.description || undefined,
          keywords: form.keywords || undefined,
          ogImage: form.ogImage || undefined,
          ogType: form.ogType || undefined,
          canonical: form.canonical || undefined,
          noindex: !!form.noindex,
          changefreq: form.changefreq || undefined,
          priority:
            form.priority === null || form.priority === undefined
              ? undefined
              : Number(form.priority),
          jsonLd: form.jsonLd || undefined,
          isActive: form.isActive ?? true,
        }),
      });
      setEditing(null);
      await mutatePages();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal simpan override");
    } finally {
      setBusy(false);
    }
  }

  async function deletePage(page: SeoPage) {
    setBusy(true);
    try {
      await apiFetch(`/admin/seo/pages/${page.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      await mutatePages();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading && !rows) return <Spinner label="Memuat…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;

  const dirty = Object.keys(draft).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO"
        description="Atur metadata global, verifikasi mesin pencari, analytics, sitemap, dan override per-halaman. Perubahan tersinkron otomatis ke halaman publik dalam ±5 menit."
        action={
          <div className="flex items-center gap-2">
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              sitemap.xml ↗
            </a>
            <a
              href="/robots.txt"
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              robots.txt ↗
            </a>
          </div>
        }
      />

      {/* ── Global settings ─────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6 space-y-6">
        <SectionHeader title="Pengaturan global" />
        {GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <group.icon size={15} className="text-emerald-600" />
              <h3 className="text-sm font-semibold">{group.title}</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.keys.map((key) => {
                const row = byKey.get(key);
                if (!row) return null;
                const wide = TEXTAREA_KEYS.has(key);
                const isToggle = key === "seo.robots_indexable";
                return (
                  <label
                    key={key}
                    className={`block ${wide ? "sm:col-span-2" : ""}`}
                  >
                    <span className="block text-xs font-semibold text-slate-600 mb-1">
                      {row.label}
                    </span>
                    {isToggle ? (
                      <select
                        value={valueOf(key) || "true"}
                        onChange={(e) => setValue(key, e.target.value)}
                        className={INPUT}
                      >
                        <option value="true">Boleh diindeks (aktif)</option>
                        <option value="false">
                          Blokir semua (noindex global)
                        </option>
                      </select>
                    ) : wide ? (
                      <textarea
                        value={valueOf(key)}
                        onChange={(e) => setValue(key, e.target.value)}
                        rows={3}
                        className={INPUT}
                      />
                    ) : (
                      <input
                        value={valueOf(key)}
                        onChange={(e) => setValue(key, e.target.value)}
                        className={INPUT}
                        spellCheck={false}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {savedFlash && (
            <span className="text-xs text-emerald-700 font-semibold inline-flex items-center gap-1">
              <CheckCircle2 size={12} /> Tersimpan
            </span>
          )}
          {dirty && (
            <button
              type="button"
              onClick={() => setDraft({})}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Batalkan perubahan
            </button>
          )}
          <Button
            type="button"
            onClick={saveGlobals}
            disabled={!dirty || busy}
            loading={busy}
            loadingText="Menyimpan…"
          >
            Simpan pengaturan
          </Button>
        </div>
      </section>

      {/* ── Live preview ────────────────────────────────────────────── */}
      <section className="card p-5 sm:p-6 space-y-4">
        <SectionHeader
          title="Pratinjau"
          description="Lihat bagaimana sebuah halaman tampil di Google & media sosial."
        />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Path</span>
          <input
            value={previewPath}
            onChange={(e) => setPreviewPath(e.target.value)}
            placeholder="/surat/2"
            className={`${INPUT} max-w-xs font-mono`}
            spellCheck={false}
          />
          {preview && <SourceBadge source={preview.source} />}
          {preview?.noindex && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
              noindex
            </span>
          )}
        </div>

        {preview && (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Google snippet */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Hasil Google
              </p>
              <p className="truncate text-xs text-emerald-800">
                {preview.canonical}
              </p>
              <p className="text-lg leading-snug text-[#1a0dab] line-clamp-1">
                {preview.title}
              </p>
              <p className="mt-0.5 text-sm text-slate-600 line-clamp-2">
                {preview.description}
              </p>
            </div>

            {/* Social card */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Kartu sosial
              </p>
              <div className="p-4">
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  {preview.ogImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.ogImage}
                      alt=""
                      className="aspect-[1.91/1] w-full bg-slate-100 object-cover"
                    />
                  ) : (
                    <div className="grid aspect-[1.91/1] w-full place-items-center bg-slate-100 text-xs text-slate-400">
                      Tidak ada OG image
                    </div>
                  )}
                  <div className="bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase text-slate-400">
                      {preview.siteName}
                    </p>
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {preview.title}
                    </p>
                    <p className="line-clamp-1 text-xs text-slate-500">
                      {preview.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Per-route overrides ─────────────────────────────────────── */}
      <section className="card p-5 sm:p-6 space-y-4">
        <SectionHeader
          title="Override per-halaman"
          description="Timpa judul/deskripsi/OG untuk path tertentu. Yang dikosongkan ikut default otomatis."
          action={
            <Button
              type="button"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() =>
                setEditing({ path: previewPath || "/", isActive: true, noindex: false })
              }
            >
              Tambah override
            </Button>
          }
        />

        {pages && pages.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Path</th>
                  <th className="py-2 pr-3 font-semibold">Judul</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">
                      {p.path}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {p.title || (
                        <span className="text-slate-400">(default)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {!p.isActive && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            nonaktif
                          </span>
                        )}
                        {p.noindex && (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                            noindex
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-1">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPreviewPath(p.path)}
                          aria-label="Pratinjau"
                          className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => setEditing(p)}
                          aria-label="Edit"
                          className="inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p)}
                          aria-label="Hapus"
                          className="inline-flex rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Belum ada override. Semua halaman memakai metadata otomatis dari
            judul konten + pengaturan global.
          </p>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Metadata global juga dapat diubah sebagian di{" "}
        <Link href="/admin/settings/ai" className="underline">
          pengaturan lain
        </Link>
        . Untuk Google Search Console, tempel token verifikasi di atas lalu
        simpan — tag-nya otomatis muncul di semua halaman.
      </p>

      {editing && (
        <EditModal
          initial={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={savePage}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={`Hapus override untuk ${confirmDelete.path}?`}
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deletePage(confirmDelete)}
        />
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: ResolvedMeta["source"] }) {
  const map: Record<ResolvedMeta["source"], { label: string; cls: string }> = {
    override: { label: "override", cls: "bg-emerald-50 text-emerald-700" },
    template: { label: "otomatis", cls: "bg-sky-50 text-sky-700" },
    default: { label: "default", cls: "bg-slate-100 text-slate-500" },
  };
  const m = map[source];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

function EditModal({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: Partial<SeoPage>;
  busy: boolean;
  onClose: () => void;
  onSave: (form: Partial<SeoPage>) => void;
}) {
  const [form, setForm] = useState<Partial<SeoPage>>(initial);
  const set = (k: keyof SeoPage, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {initial.id ? "Edit override" : "Override baru"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <ModalField label="Path" required hint="mis. /doa atau /surat/2">
            <input
              value={form.path ?? ""}
              onChange={(e) => set("path", e.target.value)}
              placeholder="/doa"
              className={`${INPUT} font-mono`}
              disabled={!!initial.id}
              spellCheck={false}
            />
          </ModalField>
          <ModalField label="Judul">
            <input
              value={form.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              className={INPUT}
            />
          </ModalField>
          <ModalField label="Deskripsi">
            <textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className={INPUT}
            />
          </ModalField>
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Keywords">
              <input
                value={form.keywords ?? ""}
                onChange={(e) => set("keywords", e.target.value)}
                className={INPUT}
              />
            </ModalField>
            <ModalField label="OG type" hint="website / article">
              <input
                value={form.ogType ?? ""}
                onChange={(e) => set("ogType", e.target.value)}
                className={INPUT}
              />
            </ModalField>
          </div>
          <ModalField label="OG image (URL)">
            <input
              value={form.ogImage ?? ""}
              onChange={(e) => set("ogImage", e.target.value)}
              className={INPUT}
              spellCheck={false}
            />
          </ModalField>
          <ModalField label="Canonical (URL, opsional)">
            <input
              value={form.canonical ?? ""}
              onChange={(e) => set("canonical", e.target.value)}
              className={INPUT}
              spellCheck={false}
            />
          </ModalField>
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="changefreq" hint="weekly / monthly…">
              <input
                value={form.changefreq ?? ""}
                onChange={(e) => set("changefreq", e.target.value)}
                className={INPUT}
              />
            </ModalField>
            <ModalField label="priority" hint="0.0 – 1.0">
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={form.priority ?? ""}
                onChange={(e) =>
                  set(
                    "priority",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                className={INPUT}
              />
            </ModalField>
          </div>
          <ModalField label="JSON-LD (opsional, object/array)">
            <textarea
              value={form.jsonLd ?? ""}
              onChange={(e) => set("jsonLd", e.target.value)}
              rows={3}
              className={`${INPUT} font-mono text-xs`}
              spellCheck={false}
            />
          </ModalField>
          <div className="flex items-center gap-5 pt-1">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={!!form.noindex}
                onChange={(e) => set("noindex", e.target.checked)}
              />
              noindex (sembunyikan dari mesin pencari)
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive ?? true}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              aktif
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => onSave(form)}
            loading={busy}
            loadingText="Menyimpan…"
          >
            Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
        {hint && <span className="font-normal text-slate-400"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ConfirmModal({
  message,
  busy,
  onCancel,
  onConfirm,
}: {
  message: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-sm text-slate-700">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Batal
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            loading={busy}
            loadingText="Menghapus…"
          >
            Hapus
          </Button>
        </div>
      </div>
    </div>
  );
}
