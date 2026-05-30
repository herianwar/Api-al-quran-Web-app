"use client";

import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  KeyRound,
  Plus,
  Power,
  PowerOff,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string;
  rateLimit: number;
  enabled: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface CreatedKey extends ApiKey {
  key: string;
}

interface FormState {
  name: string;
  scopes: string;
  rateLimit: string;
  expiresAt: string;
}

const EMPTY: FormState = { name: "", scopes: "read", rateLimit: "0", expiresAt: "" };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Derive an expiry badge from `expiresAt`. Returns null if never expires. */
function expiryStatus(
  iso: string | null,
): { label: string; cls: string } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0)
    return { label: "Expired", cls: "bg-rose-100 text-rose-700" };
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 7)
    return {
      label: `Expire ${days}h lagi`,
      cls: "bg-amber-100 text-amber-700",
    };
  return {
    label: `Sampai ${fmtDate(iso)}`,
    cls: "bg-slate-100 text-slate-600",
  };
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
        enabled
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          enabled ? "bg-emerald-500" : "bg-slate-400"
        }`}
      />
      {enabled ? "Active" : "Disabled"}
    </span>
  );
}

function ScopeChip({ value }: { value: string }) {
  const isWildcard = value === "*";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono font-semibold ${
        isWildcard
          ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
          : "bg-slate-100 text-slate-700"
      }`}
      title={isWildcard ? "Wildcard — semua scope" : value}
    >
      {isWildcard && <Shield size={10} />}
      {value}
    </span>
  );
}

export default function AdminApiKeysPage() {
  const { data, error, isLoading, mutate } = useSWR<ApiKey[]>(
    "/admin/api-keys",
    fetcher,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(EMPTY);
  const [formBusy, setFormBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ApiKey | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<ApiKey | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const actingRef = useRef(false);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (formBusy || !formState.name.trim()) return;
    setFormBusy(true);
    try {
      const { data: created } = await apiFetch<CreatedKey>("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: formState.name.trim(),
          scopes: formState.scopes,
          rateLimit: Number(formState.rateLimit) || 0,
          expiresAt: formState.expiresAt || undefined,
        }),
      });
      setJustCreated(created);
      setFormOpen(false);
      setFormState(EMPTY);
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membuat key");
    } finally {
      setFormBusy(false);
    }
  }

  async function doEnable(k: ApiKey) {
    if (actingRef.current) return;
    actingRef.current = true;
    setActingId(k.id);
    try {
      await apiFetch(`/admin/api-keys/${k.id}/enable`, { method: "PUT" });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal");
    } finally {
      setActingId(null);
      actingRef.current = false;
    }
  }

  async function doDisable() {
    const k = confirmDisable;
    setConfirmDisable(null);
    if (!k || actingRef.current) return;
    actingRef.current = true;
    setActingId(k.id);
    try {
      await apiFetch(`/admin/api-keys/${k.id}/disable`, { method: "PUT" });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal");
    } finally {
      setActingId(null);
      actingRef.current = false;
    }
  }

  async function doDelete() {
    const k = confirmDelete;
    setConfirmDelete(null);
    if (!k || actingRef.current) return;
    actingRef.current = true;
    setActingId(k.id);
    try {
      await apiFetch(`/admin/api-keys/${k.id}`, { method: "DELETE" });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setActingId(null);
      actingRef.current = false;
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore — clipboard unavailable */
    }
  }

  const rows = data ?? [];
  const total = rows.length;
  const active = rows.filter((r) => r.enabled).length;
  const expired = rows.filter(
    (r) => r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now(),
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="API Keys"
        description={
          data
            ? `${total} key total · ${active} aktif${expired ? ` · ${expired} expired` : ""}`
            : "Key untuk identifikasi client (Android, iOS). Dipakai di header X-API-Key."
        }
        action={
          <div className="flex gap-2">
            <RefreshButton onRefresh={() => mutate()} />
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setFormState(EMPTY);
                setFormOpen(true);
              }}
            >
              Key baru
            </Button>
          </div>
        }
      />

      {/* Just-created key — shown ONCE */}
      {justCreated && (
        <div className="card p-5 ring-2 ring-emerald-500/50 bg-emerald-50/50">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-semibold text-emerald-900 inline-flex items-center gap-1.5">
                <Check size={16} />
                Key &quot;{justCreated.name}&quot; berhasil dibuat
              </p>
              <p className="text-xs text-amber-800 inline-flex items-start gap-1.5 mt-1">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                Simpan key ini sekarang — setelah ditutup, tidak akan ditampilkan
                lagi.
              </p>
            </div>
            <button
              onClick={() => setJustCreated(null)}
              className="shrink-0 text-emerald-700 hover:text-emerald-900 text-sm font-medium"
            >
              Saya sudah simpan
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2.5 font-mono text-xs overflow-hidden">
            <span className="text-slate-900 truncate flex-1 select-all">
              {justCreated.key}
            </span>
            <button
              onClick={() => copyToClipboard(justCreated.key)}
              className="shrink-0 inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 text-xs font-semibold px-2 py-1 rounded hover:bg-emerald-50"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Tersalin" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {isLoading && !data && <Spinner label="Memuat…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={KeyRound}
          title="Belum ada API key"
          description={`Klik "Key baru" untuk membuat key pertama. Key cuma ditampilkan SEKALI saat dibuat — simpan baik-baik.`}
        />
      )}

      {data && rows.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Prefix</th>
                    <th className="px-4 py-3 text-left">Scopes</th>
                    <th className="px-4 py-3 text-left">Last used</th>
                    <th className="px-4 py-3 text-left">Expiry</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((k) => {
                    const exp = expiryStatus(k.expiresAt);
                    const busy = actingId === k.id;
                    return (
                      <tr
                        key={k.id}
                        className={`border-t border-slate-100 hover:bg-slate-50/50 ${
                          busy ? "opacity-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {k.name}
                          {k.rateLimit > 0 && (
                            <span className="ml-2 text-[10px] text-slate-400 font-normal">
                              {k.rateLimit} rpm
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {k.keyPrefix}…
                        </td>
                        <td className="px-4 py-3">
                          <ScopeChip value={k.scopes} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Belum pernah"}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {exp ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${exp.cls}`}
                            >
                              <Clock size={10} />
                              {exp.label}
                            </span>
                          ) : (
                            <span className="text-slate-400">Tidak expire</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusPill enabled={k.enabled} />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() =>
                              k.enabled ? setConfirmDisable(k) : doEnable(k)
                            }
                            disabled={busy}
                            aria-label={k.enabled ? "Nonaktifkan" : "Aktifkan"}
                            title={k.enabled ? "Disable" : "Enable"}
                            className="inline-flex p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                          >
                            {k.enabled ? (
                              <PowerOff size={16} />
                            ) : (
                              <Power size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(k)}
                            disabled={busy}
                            aria-label="Hapus"
                            title="Hapus"
                            className="inline-flex p-2 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 ml-1 disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-2">
            {rows.map((k) => {
              const exp = expiryStatus(k.expiresAt);
              const busy = actingId === k.id;
              return (
                <li
                  key={k.id}
                  className={`card p-4 ${busy ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {k.name}
                      </h3>
                      <p className="font-mono text-xs text-slate-500 truncate mt-0.5">
                        {k.keyPrefix}…
                      </p>
                    </div>
                    <StatusPill enabled={k.enabled} />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <ScopeChip value={k.scopes} />
                    {k.rateLimit > 0 && (
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">
                        {k.rateLimit} rpm
                      </span>
                    )}
                    {exp && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${exp.cls}`}
                      >
                        <Clock size={10} />
                        {exp.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Last used:{" "}
                    {k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "belum pernah"}
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() =>
                        k.enabled ? setConfirmDisable(k) : doEnable(k)
                      }
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-500 disabled:opacity-40"
                    >
                      {k.enabled ? (
                        <>
                          <PowerOff size={13} /> Disable
                        </>
                      ) : (
                        <>
                          <Power size={13} /> Enable
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(k)}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                    >
                      <Trash2 size={13} /> Hapus
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {formOpen && (
        <CreateKeyModal
          state={formState}
          setState={setFormState}
          onSubmit={createKey}
          busy={formBusy}
          onClose={() => !formBusy && setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDisable}
        title="Nonaktifkan key?"
        message={
          confirmDisable
            ? `Key "${confirmDisable.name}" akan langsung berhenti diterima oleh API. Client yang sedang pakai akan dapat 401. Bisa diaktifkan kembali nanti.`
            : ""
        }
        confirmLabel="Disable"
        tone="danger"
        onConfirm={doDisable}
        onCancel={() => setConfirmDisable(null)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Hapus key?"
        message={
          confirmDelete
            ? `Key "${confirmDelete.name}" akan dihapus permanen. Tidak bisa di-undo — client manapun yang pakai key ini langsung tidak bisa akses.`
            : ""
        }
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function Field({
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
      <span className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
        {required && <span className="text-rose-500"> *</span>}
        {hint && (
          <span className="font-normal text-slate-400"> · {hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function CreateKeyModal({
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

  // Min date = today (YYYY-MM-DD in local time) so the picker can't choose past.
  const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Buat API key baru"
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
          <h2 className="font-semibold text-slate-900">Buat API Key baru</h2>
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
          <Field label="Nama" required hint="label untuk identifikasi">
            <input
              ref={firstFieldRef}
              placeholder="mis. Android v1.0"
              value={state.name}
              onChange={(e) => setState({ ...state, name: e.target.value })}
              required
              maxLength={120}
              className={INPUT}
            />
          </Field>

          <Field label="Scopes">
            <select
              value={state.scopes}
              onChange={(e) => setState({ ...state, scopes: e.target.value })}
              className={INPUT}
            >
              <option value="read">read — endpoint publik</option>
              <option value="read,write">read,write — termasuk user</option>
              <option value="*">* — semua (admin)</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate limit" hint="req/menit · 0 = default">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                value={state.rateLimit}
                onChange={(e) =>
                  setState({ ...state, rateLimit: e.target.value })
                }
                className={INPUT}
              />
            </Field>
            <Field label="Expiry" hint="opsional">
              <input
                type="date"
                min={todayStr}
                value={state.expiresAt}
                onChange={(e) =>
                  setState({ ...state, expiresAt: e.target.value })
                }
                className={INPUT}
              />
            </Field>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed border-l-2 border-amber-300 bg-amber-50/60 pl-3 py-2 rounded-r">
            <strong className="text-amber-800">Penting:</strong> raw key akan
            ditampilkan SEKALI saja setelah dibuat. Simpan di tempat aman —
            backend cuma menyimpan hash bcrypt-nya.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={busy} loadingText="Membuat…">
            Buat key
          </Button>
        </div>
      </form>
    </div>
  );
}
