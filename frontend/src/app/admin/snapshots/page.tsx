"use client";

import {
  Archive,
  Database,
  Download,
  HardDrive,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, apiFetchRaw, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";

interface Snapshot {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Tone = "ok" | "err";
type Feedback = { tone: Tone; msg: string } | null;

export default function AdminSnapshotsPage() {
  const { data, error, isLoading, mutate } = useSWR<Snapshot[]>(
    "/seed/snapshot",
    fetcher,
  );

  const [exporting, setExporting] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<Snapshot | null>(
    null,
  );
  const [deleteCandidate, setDeleteCandidate] = useState<Snapshot | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function toast(tone: Tone, msg: string) {
    setFeedback({ tone, msg });
    setTimeout(() => setFeedback(null), 6000);
  }

  async function exportNow() {
    if (exporting) return;
    setExporting(true);
    setFeedback(null);
    try {
      const { data: info } = await apiFetch<Snapshot>("/seed/snapshot/export", {
        method: "POST",
      });
      toast("ok", `Snapshot ${info.name} berhasil dibuat (${formatBytes(info.size)}).`);
      await mutate();
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Gagal export");
    } finally {
      setExporting(false);
    }
  }

  async function doRestore() {
    const snap = restoreCandidate;
    setRestoreCandidate(null);
    if (!snap || busyName) return;
    setBusyName(snap.name);
    setFeedback(null);
    try {
      await apiFetch("/seed/snapshot/import", {
        method: "POST",
        body: JSON.stringify({ filename: snap.name }),
      });
      toast("ok", `Snapshot ${snap.name} ter-restore.`);
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Gagal restore");
    } finally {
      setBusyName(null);
    }
  }

  async function doDelete() {
    const snap = deleteCandidate;
    setDeleteCandidate(null);
    if (!snap || busyName) return;
    setBusyName(snap.name);
    try {
      await apiFetch(`/seed/snapshot/${encodeURIComponent(snap.name)}`, {
        method: "DELETE",
      });
      toast("ok", `Snapshot ${snap.name} dihapus.`);
      await mutate();
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setBusyName(null);
    }
  }

  async function downloadSnapshot(snap: Snapshot) {
    if (busyName) return;
    setBusyName(snap.name);
    setFeedback(null);
    try {
      const res = await apiFetchRaw(
        `/seed/snapshot/${encodeURIComponent(snap.name)}/download`,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = snap.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast("err", err instanceof Error ? err.message : "Gagal download");
    } finally {
      setBusyName(null);
    }
  }

  const rows = data ?? [];
  const totalSize = rows.reduce((s, r) => s + r.size, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Snapshots"
        description={
          data
            ? `${rows.length} file · total ${formatBytes(totalSize)}`
            : "Backup konten (surat, ayat, tafsir, terjemahan, doa, dll) untuk off-site backup atau migrasi VPS."
        }
        action={
          <div className="flex gap-2">
            <RefreshButton onRefresh={() => mutate()} />
            <Button
              icon={
                exporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={16} />
                )
              }
              onClick={exportNow}
              loading={exporting}
              loadingText="Mengekspor…"
            >
              Export sekarang
            </Button>
          </div>
        }
      />

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm flex items-start gap-2 ${
            feedback.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
          role="status"
        >
          <span className="flex-1">{feedback.msg}</span>
          <button
            onClick={() => setFeedback(null)}
            aria-label="Tutup"
            className="text-current/60 hover:text-current"
          >
            ×
          </button>
        </div>
      )}

      {isLoading && !data && <Spinner label="Memuat…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={Database}
          title="Belum ada snapshot"
          description={`Klik "Export sekarang" untuk membuat snapshot pertama. File disimpan di server dan bisa di-download untuk arsip eksternal.`}
        />
      )}

      {rows.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">File</th>
                    <th className="px-4 py-3 text-right">Ukuran</th>
                    <th className="px-4 py-3 text-left">Dibuat</th>
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const busy = busyName === s.name;
                    return (
                      <tr
                        key={s.name}
                        className={`border-t border-slate-100 hover:bg-slate-50/50 ${
                          busy ? "opacity-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 break-all">
                          {s.name}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums whitespace-nowrap">
                          {formatBytes(s.size)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {fmtWhen(s.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => downloadSnapshot(s)}
                            disabled={busy}
                            aria-label="Download"
                            title="Download .sql.gz ke laptop"
                            className="inline-flex p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                          >
                            {busy ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Download size={15} />
                            )}
                          </button>
                          <button
                            onClick={() => setRestoreCandidate(s)}
                            disabled={busy}
                            aria-label="Restore"
                            title="Restore snapshot ke DB"
                            className="inline-flex p-2 rounded-lg text-amber-700 hover:bg-amber-50 ml-1 disabled:opacity-40"
                          >
                            <Upload size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteCandidate(s)}
                            disabled={busy}
                            aria-label="Hapus"
                            title="Hapus file snapshot"
                            className="inline-flex p-2 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 ml-1 disabled:opacity-40"
                          >
                            <Trash2 size={15} />
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
            {rows.map((s) => {
              const busy = busyName === s.name;
              return (
                <li
                  key={s.name}
                  className={`card p-4 ${busy ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                      <Archive size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-slate-700 break-all">
                        {s.name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {fmtWhen(s.createdAt)} · {formatBytes(s.size)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2">
                    <button
                      onClick={() => downloadSnapshot(s)}
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-500 disabled:opacity-40"
                    >
                      {busy ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      Download
                    </button>
                    <button
                      onClick={() => setRestoreCandidate(s)}
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                    >
                      <Upload size={13} /> Restore
                    </button>
                    <button
                      onClick={() => setDeleteCandidate(s)}
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
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

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600 leading-relaxed">
        <div className="flex items-start gap-2">
          <HardDrive size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <div>
            File <code className="bg-white px-1 py-0.5 rounded font-mono">.sql.gz</code>{" "}
            tersimpan di server (lihat <em>System Health → Snapshots</em>{" "}
            untuk path absolut). Pakai tombol{" "}
            <strong>Download</strong> di tiap baris untuk pull ke laptop, atau
            script <code className="bg-white px-1 py-0.5 rounded font-mono">
              scripts/restore-snapshot.sh
            </code>{" "}
            untuk restore di VPS lain (jalankan{" "}
            <code className="bg-white px-1 py-0.5 rounded font-mono">
              prisma migrate deploy
            </code>{" "}
            dulu di target).
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!restoreCandidate}
        title="Restore snapshot?"
        message={
          restoreCandidate
            ? `${restoreCandidate.name} (${formatBytes(restoreCandidate.size)}) akan di-import ke database. Data konten yang ada akan diganti (user data tidak terpengaruh). Pastikan DB sudah ter-migrate.`
            : ""
        }
        confirmLabel="Restore sekarang"
        tone="danger"
        onConfirm={doRestore}
        onCancel={() => setRestoreCandidate(null)}
      />

      <ConfirmDialog
        open={!!deleteCandidate}
        title="Hapus snapshot?"
        message={
          deleteCandidate
            ? `File ${deleteCandidate.name} (${formatBytes(deleteCandidate.size)}) akan dihapus permanen dari server. Tidak bisa di-undo.`
            : ""
        }
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteCandidate(null)}
      />
    </div>
  );
}
