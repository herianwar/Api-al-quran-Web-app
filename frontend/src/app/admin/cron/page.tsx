"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Play,
  Timer,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";

interface Schedule {
  name: string;
  pattern: string;
  next: string | null;
  key: string;
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface Run {
  id: string | null;
  name: string;
  status: "completed" | "failed" | "active";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  attemptsMade: number;
  result: unknown;
  failedReason: string | null;
}

const JOBS: Record<string, { label: string; desc: string }> = {
  "daily-verse": {
    label: "Ayat Hari Ini",
    desc: "Kirim 1 ayat (rotasi berdasarkan tanggal) ke semua device.",
  },
  "hafalan-reminder": {
    label: "Pengingat Hafalan",
    desc: "Kirim ke user yang punya ayat hafalan jatuh tempo hari ini.",
  },
};

function jobLabel(name: string) {
  return JOBS[name]?.label ?? name;
}

/** "07:00" in Asia/Jakarta for any ISO timestamp. Used to humanize cron times. */
function timeOfDayWIB(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function timeUntil(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 60_000) return "segera";
  const totalMin = Math.floor(diff / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  if (days >= 1) return `${days} hari lagi`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return mins > 0 ? `${hours}j ${mins}m lagi` : `${hours}j lagi`;
  return `${mins}m lagi`;
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Best-effort one-liner summary of a job's return value. */
function summarizeResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (typeof r.attempted === "number") {
    return `${r.successful ?? 0}/${r.attempted} terkirim` +
      (typeof r.invalidTokensRemoved === "number" && r.invalidTokensRemoved > 0
        ? ` · ${r.invalidTokensRemoved} token dibersihkan`
        : "");
  }
  if (typeof r.users === "number") {
    return `${r.sent ?? 0} terkirim ke ${r.users} user`;
  }
  if (r.skipped) return "dilewati (tidak ada data)";
  return null;
}

function StatusBadge({ status }: { status: Run["status"] }) {
  const cfg = {
    completed: {
      cls: "bg-emerald-100 text-emerald-700",
      Icon: CheckCircle2,
      label: "Sukses",
    },
    failed: {
      cls: "bg-rose-100 text-rose-700",
      Icon: XCircle,
      label: "Gagal",
    },
    active: {
      cls: "bg-sky-100 text-sky-700",
      Icon: Loader2,
      label: "Berjalan",
    },
  }[status];
  const { Icon } = cfg;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}
    >
      <Icon size={11} className={status === "active" ? "animate-spin" : ""} />
      {cfg.label}
    </span>
  );
}

function StatTile({
  label,
  value,
  Icon,
  tone = "slate",
}: {
  label: string;
  value: number | undefined;
  Icon: typeof Clock;
  tone?: "slate" | "sky" | "emerald" | "amber" | "rose";
}) {
  const toneCls = {
    slate: "text-slate-500",
    sky: "text-sky-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
  }[tone];
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Icon size={14} className={toneCls} />
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
        {value === undefined ? "—" : value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

export default function AdminCronPage() {
  const {
    data: schedules,
    error: schedulesError,
    isLoading: schedulesLoading,
  } = useSWR<Schedule[]>("/admin/cron/schedules", fetcher);
  const { data: stats, mutate: mutateStats } = useSWR<QueueStats>(
    "/admin/cron/queue-stats",
    fetcher,
    { refreshInterval: 30_000 },
  );
  const { data: runs, mutate: mutateRuns } = useSWR<Run[]>(
    "/admin/cron/runs?limit=20",
    fetcher,
    { refreshInterval: 30_000 },
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmJob, setConfirmJob] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "ok" | "err";
    msg: string;
  } | null>(null);
  // Synchronous guard against double-trigger (ConfirmDialog fires onConfirm on
  // both button click and Enter keydown — see broadcast page for the same
  // pattern).
  const triggeringRef = useRef(false);

  // Auto-dismiss feedback after 6s so banners don't linger.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 6_000);
    return () => clearTimeout(t);
  }, [feedback]);

  async function doTrigger() {
    const job = confirmJob;
    setConfirmJob(null);
    if (!job || triggeringRef.current) return;
    triggeringRef.current = true;
    setBusy(job);
    setFeedback(null);
    try {
      await apiFetch(`/admin/cron/run/${encodeURIComponent(job)}`, {
        method: "POST",
      });
      setFeedback({
        tone: "ok",
        msg: `Job "${jobLabel(job)}" sudah di-queue. Worker akan menjalankannya sebentar lagi.`,
      });
      // Give the worker a moment to pick up the job, then refresh history.
      setTimeout(() => {
        void mutateStats();
        void mutateRuns();
      }, 1500);
    } catch (err) {
      setFeedback({
        tone: "err",
        msg: `Gagal trigger: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    } finally {
      setBusy(null);
      triggeringRef.current = false;
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cron & Push Jobs"
        description="Jadwal otomatis push notification, statistik queue, dan tombol manual trigger."
      />

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-sm ${
            feedback.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
          role="status"
        >
          {feedback.tone === "ok" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
          )}
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

      {/* Queue stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <StatTile label="Waiting" value={stats?.waiting} Icon={Clock} tone="slate" />
        <StatTile label="Active" value={stats?.active} Icon={Loader2} tone="sky" />
        <StatTile label="Completed" value={stats?.completed} Icon={CheckCircle2} tone="emerald" />
        <StatTile label="Failed" value={stats?.failed} Icon={XCircle} tone="rose" />
        <StatTile label="Delayed" value={stats?.delayed} Icon={Timer} tone="amber" />
      </div>

      {/* Schedules */}
      <section>
        <SectionHeader title="Jadwal aktif" />
        {schedulesLoading && <Spinner label="Memuat jadwal…" />}
        {schedulesError && <ErrorBox message={schedulesError.message} />}
        {schedules && schedules.length === 0 && (
          <EmptyState
            icon={Clock}
            title="Tidak ada cron job aktif"
            description="Cron job didaftarkan otomatis saat boot — kalau kosong, restart API."
          />
        )}
        {schedules && schedules.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {schedules.map((s) => {
              const meta = JOBS[s.name];
              const nextWIB = timeOfDayWIB(s.next);
              const rel = timeUntil(s.next);
              return (
                <div key={s.key} className="card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">
                        {meta?.label ?? s.name}
                      </h3>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">
                        {s.name}
                      </p>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-semibold">
                      <Activity size={11} /> aktif
                    </span>
                  </div>
                  {meta && (
                    <p className="text-xs text-slate-500 leading-relaxed mb-3">
                      {meta.desc}
                    </p>
                  )}
                  <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock size={12} />
                      <span>
                        Setiap hari{" "}
                        <strong className="text-slate-700">
                          {nextWIB ?? "—"} WIB
                        </strong>
                        {rel && (
                          <>
                            {" "}
                            · berikutnya{" "}
                            <strong className="text-slate-700">{rel}</strong>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 mt-1">
                      {s.pattern} (UTC)
                    </p>
                  </div>
                  <Button
                    icon={<Play size={14} />}
                    size="sm"
                    onClick={() => setConfirmJob(s.name)}
                    loading={busy === s.name}
                    loadingText="Trigger…"
                  >
                    Jalankan sekarang
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent runs */}
      <section>
        <SectionHeader
          title="Riwayat eksekusi"
          description="Auto-refresh tiap 30 detik · paling baru di atas"
          action={
            runs && runs.length > 0 ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 tabular-nums">
                {runs.length}
              </span>
            ) : undefined
          }
        />
        {!runs ? (
          <Spinner label="Memuat riwayat…" />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={History}
            title="Belum ada eksekusi"
            description="Begitu cron atau trigger manual berjalan, hasilnya akan tampil di sini."
          />
        ) : (
          <div className="space-y-2">
            {runs.map((r) => {
              const summary = summarizeResult(r.result);
              const isManual = r.id?.startsWith("manual:");
              return (
                <div key={`${r.id}-${r.createdAt}`} className="card p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={r.status} />
                        <h4 className="font-semibold text-slate-900 truncate">
                          {jobLabel(r.name)}
                        </h4>
                        {isManual && (
                          <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            manual
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1.5 flex-wrap">
                        <span>{fmtWhen(r.finishedAt ?? r.startedAt ?? r.createdAt)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Timer size={11} /> {fmtDuration(r.durationMs)}
                        </span>
                        {r.attemptsMade > 1 && (
                          <span className="text-amber-600">
                            attempt #{r.attemptsMade}
                          </span>
                        )}
                      </div>
                      {summary && (
                        <p className="text-xs text-slate-600 mt-2 font-medium">
                          {summary}
                        </p>
                      )}
                      {r.failedReason && (
                        <p className="text-xs text-rose-700 mt-2 font-mono bg-rose-50 border border-rose-100 rounded px-2 py-1.5 break-all">
                          {r.failedReason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!confirmJob}
        title="Trigger job manual?"
        message={
          confirmJob
            ? `Job "${jobLabel(confirmJob)}" akan dijalankan sekarang oleh worker. Hasilnya muncul di riwayat eksekusi.`
            : ""
        }
        confirmLabel="Jalankan"
        onConfirm={doTrigger}
        onCancel={() => setConfirmJob(null)}
      />
    </div>
  );
}
