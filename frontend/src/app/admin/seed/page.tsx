"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Eraser,
  Loader2,
  Play,
  RefreshCw,
  ScrollText,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  ConfirmDialog,
  type ConfirmOptions,
} from "@/components/admin/ConfirmDialog";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";
import { API_URL, apiFetch } from "@/lib/api";

interface SeedLog {
  id: number;
  jobName: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  totalItems: number;
  doneItems: number;
  errorMsg: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

interface LogEntry {
  id: number;
  level: "info" | "success" | "warn" | "error";
  message: string;
  timestamp: string;
}

interface ProgressEvent {
  job: string;
  current: number;
  total: number;
  percent: number;
  currentItem: string;
  status: string;
  startedAt?: string;
  estimatedDone?: string;
}

interface JobDef {
  name: string;
  label: string;
  desc: string;
  group: "core" | "content" | "audio";
  warning?: string;
}

const JOBS: JobDef[] = [
  { name: "surah", label: "Surat", desc: "Metadata 114 surat dari equran.id", group: "core" },
  { name: "ayat", label: "Ayat", desc: "6.236 ayat + audio URLs + page/juz", group: "core" },
  { name: "tafsir", label: "Tafsir Kemenag", desc: "Tafsir Indonesia per ayat", group: "core" },
  { name: "doa", label: "Doa", desc: "50 doa esensial (fallback statis)", group: "core" },
  { name: "kota", label: "Kota", desc: "Daftar kota untuk jadwal sholat", group: "core" },
  {
    name: "translation",
    label: "Translation",
    desc: "Sahih International, Pickthall, Kemenag 2019 (~18k rows)",
    group: "content",
  },
  {
    name: "tafsir_extra",
    label: "Tafsir tambahan",
    desc: "Ibn Kathir AR/EN + Muyassar dari quran.com",
    group: "content",
  },
  {
    name: "asbabun_nuzul",
    label: "Asbabun Nuzul",
    desc: "Konteks turunnya ayat (curated, 93 entry)",
    group: "content",
  },
  {
    name: "topic",
    label: "Topik",
    desc: "Mapping ayat ke tema (20 topik, 320 ayat)",
    group: "content",
  },
  {
    name: "asmaul_husna",
    label: "Asmaul Husna",
    desc: "99 Nama Allah (arab + latin + arti). Bundled JSON statis, <1 detik.",
    group: "content",
  },
  {
    name: "ayat_kata",
    label: "Kata-perkata (word-by-word)",
    desc: "Arab + transliterasi + arti Indonesia per kata, 6.236 ayat. Sumber: api.quran.com (bahasa Indonesia, ~77k baris).",
    group: "content",
    warning: "~5-7 menit. Idempotent: per-ayat replace, aman dijalankan ulang.",
  },
  {
    name: "embeddings",
    label: "AI Embeddings (semantic search)",
    desc: "Embed 6.236 ayat ke vektor 1536-dim (OpenAI text-embedding-3-small) untuk fitur /tanya & toggle Tanya AI. Butuh API key di /admin/settings/ai.",
    group: "content",
    warning:
      "~5 menit · biaya OpenAI ~$0.01 sekali jalan. Idempotent (skip ayat yang sourceHash-nya sudah cocok).",
  },
  {
    name: "sajdah",
    label: "Ayat Sajdah",
    desc: "15 ayat sajdah tilawah di Al-Qur'an, di-tag pada kolom `sajdah` (wajibah/mukhtalaf). Dipakai halaman /sajdah & badge di ayat. Bundled JSON, instan.",
    group: "content",
  },
  {
    name: "niat_shalat",
    label: "Niat Shalat Fardhu",
    desc: "5 niat shalat (Subuh-Isya) + arab/latin/arti. Sumber awal islamic-api.vwxyz.id, kemudian di-bundle statis. Instan.",
    group: "content",
  },
  {
    name: "bacaan_shalat",
    label: "Bacaan Shalat per Gerakan",
    desc: "10 gerakan dengan 31 bacaan (Takbiratul Ihram → Salam). Bundled statis. Instan.",
    group: "content",
  },
  {
    name: "tahlil",
    label: "Tahlil",
    desc: "Urutan lengkap bacaan tahlil — 44 entry (pengantar → doa penutup). Bundled statis. Instan.",
    group: "content",
  },
  {
    name: "hadith",
    label: "Hadis (9 perawi)",
    desc: "~38.000 hadis (Bukhari, Muslim, Abu Dawud, Tirmidzi, Nasai, Ibnu Majah, Ahmad, Malik, Darimi) dari renomureza/hadis-api-id (MIT). Self-host total.",
    group: "content",
    warning: "5-15 menit. Download ~70MB JSON dari GitHub.",
  },
  {
    name: "jadwal_sholat",
    label: "Jadwal sholat",
    desc: "Pre-fetch jadwal sholat semua kota × 12 bulan dari myquran.com (~6.200 panggilan, idempotent — yang sudah lengkap di-skip)",
    group: "content",
    warning:
      "30-60 menit tergantung jaringan. Setelah ini, /sholat tidak butuh myquran.com lagi.",
  },
  {
    name: "audio",
    label: "Audio cache",
    desc: "Pre-download semua MP3 (sudah ada di disk akan di-skip)",
    group: "audio",
    warning: "~18 GB disk (6 qari × 114 surat-full + 6.236 ayat), 1-3 jam tergantung jaringan",
  },
];

const RUN_ALL_JOBS = new Set<string>([
  "surah",
  "ayat",
  "tafsir",
  "doa",
  "kota",
  "translation",
  "asbabun_nuzul",
  "topic",
]);

const GROUP_LABEL: Record<JobDef["group"], string> = {
  core: "Core",
  content: "Konten tambahan",
  audio: "Audio warm-up (lama)",
};

const GROUP_DESC: Record<JobDef["group"], string> = {
  core: "Metadata & teks utama — semua termasuk dalam “Run All Core”.",
  content:
    "Translation, Asbabun Nuzul & Topik ikut “Run All Core”. Tafsir tambahan harus dijalankan manual.",
  audio: "Pre-download audio — jalankan manual, butuh waktu lama & ruang besar.",
};

export default function AdminSeedPage() {
  const [logs, setLogs] = useState<SeedLog[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { onConfirm: () => void }) | null
  >(null);
  const liveProgress = useRef<Map<string, ProgressEvent>>(new Map());
  const [, setProgressTick] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const nextLogId = useRef(1);
  const flushScheduled = useRef(false);

  const askConfirm = useCallback(
    (opts: ConfirmOptions, onYes: () => void) => {
      setConfirmState({
        ...opts,
        onConfirm: () => {
          setConfirmState(null);
          onYes();
        },
      });
    },
    [],
  );

  // Coalesce frequent seed:progress events into one re-render per animation
  // frame — a full ayat run emits thousands of events otherwise.
  const scheduleProgressFlush = useCallback(() => {
    if (flushScheduled.current) return;
    flushScheduled.current = true;
    requestAnimationFrame(() => {
      flushScheduled.current = false;
      setProgressTick((n) => n + 1);
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await apiFetch<SeedLog[]>("/seed/status");
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal poll status seed");
    }
  }, []);

  const pushLog = useCallback(
    (level: LogEntry["level"], message: string, ts?: string) => {
      const entry: LogEntry = {
        id: nextLogId.current++,
        level,
        message,
        timestamp: ts ?? new Date().toISOString(),
      };
      setLiveLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > 200) next.shift();
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    void refreshStatus();
    const interval = setInterval(refreshStatus, 5_000);

    const origin = API_URL.replace(/\/api\/v\d+$/, "");
    const socket = io(`${origin}/seed-progress`, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setWsConnected(true));
    socket.on("disconnect", () => setWsConnected(false));

    socket.on("seed:progress", (data: ProgressEvent) => {
      liveProgress.current.set(data.job, data);
      scheduleProgressFlush();
    });

    socket.on("seed:done", (data: { job: string }) => {
      liveProgress.current.delete(data.job);
      setProgressTick((n) => n + 1);
      void refreshStatus();
    });

    socket.on(
      "seed:error",
      (data: { job: string; error: string }) => {
        pushLog("error", `${data.job}: ${data.error}`);
      },
    );

    socket.on(
      "seed:log",
      (data: {
        level: LogEntry["level"];
        message: string;
        timestamp: string;
      }) => {
        pushLog(data.level, data.message, data.timestamp);
      },
    );

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [refreshStatus, pushLog, scheduleProgressFlush]);

  function startJob(name: string, isResume: boolean, isRerunDone = false) {
    if (busy) return;
    const def = JOBS.find((j) => j.name === name);
    askConfirm(
      {
        title: isResume
          ? `Lanjutkan seed "${def?.label ?? name}"?`
          : isRerunDone
            ? `Ulangi seed "${def?.label ?? name}"?`
            : `Jalankan seed "${def?.label ?? name}"?`,
        message: isResume
          ? `Job ini akan lanjut dari titik gagal sebelumnya — item yang sudah berhasil tidak diulang. Upsert mencegah duplikat.${def?.warning ? `\n\n⚠️ ${def.warning}` : ""}`
          : isRerunDone
            ? `Job ini sudah pernah selesai. Re-run akan mereset progress ke 0 dan memproses ulang semua item dari awal (upsert — data tidak dihapus, hanya re-fetch & re-write).${def?.warning ? `\n\n⚠️ ${def.warning}` : ""}`
            : def?.warning
              ? `⚠️ ${def.warning}`
              : `Job "${name}" akan di-queue dan diproses di server.`,
        confirmLabel: isResume
          ? "Lanjutkan"
          : isRerunDone
            ? "Ulangi dari awal"
            : "Jalankan",
        tone: def?.warning || isRerunDone ? "danger" : "default",
      },
      async () => {
        setBusy(name);
        setError(null);
        try {
          await apiFetch(`/seed/start/${encodeURIComponent(name)}`, {
            method: "POST",
          });
          pushLog("info", `Job "${name}" di-queue${isResume ? " (resume)" : ""}.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gagal trigger");
        } finally {
          setBusy(null);
        }
      },
    );
  }

  function cancelJob(name: string) {
    askConfirm(
      {
        title: `Hentikan seed "${name}"?`,
        message:
          "Job yang sedang berjalan akan dibatalkan pada titik aman berikutnya. Progress yang sudah masuk tetap tersimpan, dan Retry nanti akan melanjutkan dari titik tersebut.",
        confirmLabel: "Hentikan",
        tone: "danger",
      },
      async () => {
        setError(null);
        try {
          await apiFetch(`/seed/cancel/${encodeURIComponent(name)}`, {
            method: "POST",
          });
          pushLog("warn", `Pembatalan "${name}" diminta.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gagal membatalkan");
        }
      },
    );
  }

  function startAll() {
    if (busy) return;
    askConfirm(
      {
        title: "Jalankan semua seed core?",
        message:
          "Menjalankan surah, ayat, tafsir, doa, kota, translation, asbabun nuzul & topik. Job yang gagal/dibatalkan sebelumnya otomatis dilanjutkan dari titik terakhir. Audio + Tafsir tambahan tetap manual.",
        confirmLabel: "Run All Core",
      },
      async () => {
        setBusy("__all");
        setError(null);
        try {
          await apiFetch("/seed/start", { method: "POST" });
          pushLog("info", `Run all dimulai.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gagal trigger");
        } finally {
          setBusy(null);
        }
      },
    );
  }

  function resetAll() {
    if (busy) return;
    askConfirm(
      {
        title: "Reset semua konten?",
        message:
          "Menghapus semua data Quran/tafsir/doa/kota. Data user (bookmark, hafalan) TIDAK terhapus. Tindakan ini tidak bisa di-undo.",
        confirmLabel: "Reset semua",
        tone: "danger",
      },
      async () => {
        setBusy("__reset");
        setError(null);
        try {
          await apiFetch("/seed/reset", { method: "DELETE" });
          pushLog("warn", "Semua konten di-reset.");
          await refreshStatus();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gagal reset");
        } finally {
          setBusy(null);
        }
      },
    );
  }

  function downloadLogs() {
    if (liveLogs.length === 0) return;
    const text = liveLogs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] ${l.level.toUpperCase().padEnd(7)} ${l.message}`,
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seed-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const logByName = useMemo(
    () => new Map(logs.map((l) => [l.jobName, l])),
    [logs],
  );

  const jobsByGroup = useMemo(() => {
    const groups: Record<JobDef["group"], JobDef[]> = {
      core: [],
      content: [],
      audio: [],
    };
    for (const j of JOBS) groups[j.group].push(j);
    return groups;
  }, []);

  const jobStates = JOBS.map((j) => {
    const live = liveProgress.current.get(j.name);
    const log = logByName.get(j.name);
    const status =
      live?.status === "running" ? "running" : log?.status ?? "pending";
    return { status, essential: RUN_ALL_JOBS.has(j.name) };
  });
  const doneCount = jobStates.filter((s) => s.status === "done").length;
  const runningCount = jobStates.filter((s) => s.status === "running").length;
  const errorCount = jobStates.filter((s) => s.status === "error").length;
  const idleCount = JOBS.length - doneCount - runningCount - errorCount;
  const coreJobs = jobStates.filter((s) => s.essential);
  const coreDone = coreJobs.filter((s) => s.status === "done").length;
  const overallPct =
    coreJobs.length > 0 ? Math.round((coreDone / coreJobs.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Seed Control"
        description="Trigger seeding & monitor progress realtime. Upsert + resume-on-failure: re-run aman, gagal di tengah jalan tinggal lanjut dari titik terakhir."
        action={
          <div className="flex gap-2">
            <button
              onClick={resetAll}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 px-3.5 py-2.5 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50"
            >
              <Eraser size={14} />
              Reset All
            </button>
            <button
              onClick={startAll}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
            >
              {busy === "__all" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              Run All Core
            </button>
          </div>
        }
      />

      {/* Connection indicator */}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full font-semibold ${
            wsConnected
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
            }`}
          />
          WebSocket {wsConnected ? "live" : "disconnected"}
        </span>
        <button
          onClick={() => refreshStatus()}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
        >
          <RefreshCw size={12} /> Refresh status
        </button>
      </div>

      {/* Overall progress summary */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">
            Progress core
          </span>
          <span className="text-xs font-mono text-slate-600">
            {coreDone}/{coreJobs.length} core selesai · {overallPct}%
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              errorCount > 0 && runningCount === 0
                ? "bg-amber-500"
                : "bg-emerald-500"
            }`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Loader2
              size={11}
              className={runningCount > 0 ? "animate-spin text-sky-600" : "text-slate-400"}
            />
            {runningCount} berjalan
          </span>
          <span className="text-emerald-700 font-medium">{doneCount} selesai</span>
          {errorCount > 0 && (
            <span className="text-rose-600 font-semibold">{errorCount} error</span>
          )}
          <span>{idleCount} idle</span>
        </div>
      </div>

      {error && (
        <div className="card p-4 bg-rose-50 border-rose-200 text-sm text-rose-800 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {(["core", "content", "audio"] as const).map((g) => (
        <section key={g}>
          <SectionHeader title={GROUP_LABEL[g]} description={GROUP_DESC[g]} />
          <div className="grid sm:grid-cols-2 gap-3">
            {jobsByGroup[g].map((j) => {
              const log = logByName.get(j.name);
              const live = liveProgress.current.get(j.name);
              const status =
                live?.status === "running"
                  ? "running"
                  : log?.status ?? "pending";
              const current = live?.current ?? log?.doneItems ?? 0;
              const total = live?.total ?? log?.totalItems ?? 0;
              const pct =
                total > 0 ? Math.min(100, (current / total) * 100) : 0;
              const eta = live?.estimatedDone
                ? new Date(live.estimatedDone)
                : null;
              // Resume-eligible: prior run errored/cancelled with partial progress.
              const canResume =
                (status === "error" || status === "cancelled") &&
                (log?.doneItems ?? 0) > 0;
              const isFreshError =
                (status === "error" || status === "cancelled") && !canResume;
              const isRerunDone = status === "done";
              return (
                <div key={j.name} className="card p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={status} />
                        <h3 className="font-semibold text-slate-900 truncate">
                          {j.label}
                        </h3>
                        {!RUN_ALL_JOBS.has(j.name) && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            Manual
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {j.desc}
                      </p>
                      {j.warning && (
                        <p className="text-xs text-amber-700 mt-1 leading-relaxed flex items-start gap-1">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                          {j.warning}
                        </p>
                      )}
                    </div>
                    {status === "running" ? (
                      <button
                        onClick={() => cancelJob(j.name)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        <Ban size={12} />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          startJob(j.name, canResume, isRerunDone)
                        }
                        disabled={!!busy}
                        title={
                          canResume
                            ? `Lanjut dari item ${(log?.doneItems ?? 0) + 1}`
                            : isRerunDone
                              ? "Ulangi dari awal — progress akan direset ke 0"
                              : undefined
                        }
                        className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                          canResume
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : isRerunDone
                              ? "border-slate-300 bg-white text-slate-600 hover:border-slate-500 hover:text-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
                        }`}
                      >
                        {busy === j.name ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : isRerunDone || isFreshError ? (
                          <RefreshCw size={12} />
                        ) : (
                          <Play size={12} />
                        )}
                        {canResume
                          ? "Resume"
                          : isFreshError
                            ? "Retry"
                            : isRerunDone
                              ? "Ulang"
                              : "Run"}
                      </button>
                    )}
                  </div>
                  {total > 0 && (
                    <>
                      <div className="flex items-baseline justify-between text-xs mb-1.5 gap-2">
                        <span className="font-mono text-slate-700 truncate">
                          {current.toLocaleString("id-ID")} /{" "}
                          {total.toLocaleString("id-ID")}
                        </span>
                        <span className="font-semibold text-slate-600">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            status === "error"
                              ? "bg-rose-500"
                              : status === "cancelled"
                                ? "bg-amber-500"
                                : status === "done"
                                  ? "bg-emerald-500"
                                  : "bg-emerald-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {live?.currentItem && status === "running" && (
                        <p className="text-[11px] text-slate-500 mt-1.5 truncate">
                          → {live.currentItem}
                        </p>
                      )}
                      {eta && status === "running" && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          ETA: {eta.toLocaleTimeString("id-ID")}
                        </p>
                      )}
                      {canResume && (
                        <p className="text-[11px] text-amber-700 mt-1.5">
                          Klik <strong>Resume</strong> untuk lanjut dari item{" "}
                          {(log?.doneItems ?? 0) + 1}.
                        </p>
                      )}
                    </>
                  )}
                  {log?.errorMsg && (
                    <p className="mt-2 text-xs text-rose-700 bg-rose-50 px-2 py-1.5 rounded leading-relaxed break-words">
                      {log.errorMsg}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Live logs */}
      <section>
        <SectionHeader
          title="Live logs"
          description={`${liveLogs.length} entries · max 200 ditampilkan`}
          action={
            liveLogs.length > 0 ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadLogs}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
                >
                  <Download size={12} /> Download
                </button>
                <button
                  onClick={() => setLiveLogs([])}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                >
                  Clear
                </button>
              </div>
            ) : null
          }
        />
        <div className="card overflow-hidden">
          <div className="bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed p-4 max-h-80 overflow-y-auto">
            {liveLogs.length === 0 ? (
              <p className="text-slate-500 italic flex items-center gap-2">
                <ScrollText size={14} /> Belum ada log. Trigger seed untuk lihat
                aktivitas realtime.
              </p>
            ) : (
              liveLogs
                .slice()
                .reverse()
                .map((l) => (
                  <div key={l.id} className="flex items-start gap-2 py-0.5">
                    <span className="text-slate-500 shrink-0">
                      {new Date(l.timestamp).toLocaleTimeString("id-ID", {
                        hour12: false,
                      })}
                    </span>
                    <span
                      className={`shrink-0 ${
                        l.level === "success"
                          ? "text-emerald-400"
                          : l.level === "warn"
                            ? "text-amber-400"
                            : l.level === "error"
                              ? "text-rose-400"
                              : "text-sky-400"
                      }`}
                    >
                      {l.level === "success"
                        ? "✓"
                        : l.level === "warn"
                          ? "⚠"
                          : l.level === "error"
                            ? "✗"
                            : "ℹ"}
                    </span>
                    <span className="text-slate-200 break-all">
                      {l.message}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "running")
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700">
        <Loader2 size={10} className="animate-spin" />
        Running
      </span>
    );
  if (status === "done")
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={10} /> Done
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">
        <XCircle size={10} /> Error
      </span>
    );
  if (status === "cancelled")
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
        <Ban size={10} /> Dibatalkan
      </span>
    );
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
      Idle
    </span>
  );
}
