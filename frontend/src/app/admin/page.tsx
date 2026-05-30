"use client";

import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Bookmark,
  Boxes,
  Brain,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  KeyRound,
  Languages,
  Library,
  Loader2,
  ScrollText,
  Shield,
  Smartphone,
  Sparkles,
  Tag,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetcher, fetcherFull } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { StatCard } from "@/components/admin/StatCard";

interface Stats {
  users: { total: number; admins: number };
  content: {
    surah: number;
    ayat: number;
    tafsir: number;
    translation: number;
    doa: number;
    asbabunNuzul: number;
    topic: number;
    /** Optional — populated after backend deploy that adds hadis count. */
    perawi?: number;
    hadis?: number;
    kota?: number;
    jadwalSholat?: number;
    asmaulHusna?: number;
  };
  userActivity: { bookmark: number; hafalan: number; deviceTokens: number };
}

interface SystemHealth {
  database: { size: string };
  redis: { connected: boolean; hitRate?: number } | null;
  node: {
    uptimeSeconds: number;
    memoryUsage: { heapUsed: number; heapTotal: number };
    env: string;
  };
}

interface SeedLog {
  jobName: string;
  status: "pending" | "running" | "done" | "error" | "cancelled";
  totalItems: number;
  doneItems: number;
  errorMsg: string | null;
  updatedAt: string;
}

interface AuditEntry {
  id: number;
  action: string;
  actorEmail: string | null;
  target: string | null;
  createdAt: string;
}

const CONTENT_COLORS = [
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#0ea5e9",
  "#8b5cf6",
  "#14b8a6",
];

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "baru saja";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function verbTone(action: string): string {
  const last = action.split(".").pop() ?? "";
  if (/^(create|promote|add|send|start|export|enable)/.test(last))
    return "bg-emerald-50 text-emerald-700";
  if (/^(update|edit|trigger|run|rotate)/.test(last))
    return "bg-amber-50 text-amber-700";
  if (/^(delete|demote|remove|cancel|revoke|disable)/.test(last))
    return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

type HealthTone = "ok" | "warn" | "danger" | "neutral";

function HealthTile({
  icon,
  label,
  value,
  href,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
  tone?: HealthTone;
}) {
  const ringByTone: Record<HealthTone, string> = {
    ok: "ring-emerald-200",
    warn: "ring-amber-200",
    danger: "ring-rose-200",
    neutral: "ring-slate-200",
  };
  const body = (
    <div
      className={`rounded-xl bg-white px-3 py-3 ring-1 ${ringByTone[tone]} hover:shadow-sm transition`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
      </div>
      <p className="text-lg font-semibold text-slate-900 tabular-nums mt-1">
        {value}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function AdminDashboardPage() {
  const statsSwr = useSWR<Stats>("/admin/stats", fetcher);
  const healthSwr = useSWR<SystemHealth>("/admin/system", fetcher, {
    refreshInterval: 60_000,
  });
  const seedSwr = useSWR<SeedLog[]>("/seed/status", fetcher, {
    refreshInterval: 15_000,
  });
  const auditSwr = useSWR<{ data: AuditEntry[] }>(
    "/admin/audit?limit=5",
    (key: string) => fetcherFull<AuditEntry[]>(key),
  );

  const { data: stats } = statsSwr;
  const { data: health } = healthSwr;
  const { data: seedLogs } = seedSwr;
  const recentAudit = auditSwr.data?.data ?? [];

  const runningSeed = seedLogs?.find((s) => s.status === "running");
  const cancelledOrErrored =
    seedLogs?.filter(
      (s) => (s.status === "error" || s.status === "cancelled") && s.doneItems > 0,
    ) ?? [];

  if (statsSwr.isLoading && !stats) return <Spinner label="Memuat statistik…" />;
  if (statsSwr.error)
    return <ErrorBox message={(statsSwr.error as Error).message} />;
  if (!stats) return null;

  const heapPct = health
    ? (health.node.memoryUsage.heapUsed /
        (health.node.memoryUsage.heapTotal || 1)) *
      100
    : 0;
  const heapHigh = heapPct > 85;
  const isProd = health?.node.env === "production";

  const contentData = [
    { name: "Ayat", value: stats.content.ayat },
    { name: "Terjemahan", value: stats.content.translation },
    { name: "Tafsir", value: stats.content.tafsir },
    { name: "Hadis", value: stats.content.hadis ?? 0 },
    { name: "Doa", value: stats.content.doa },
    { name: "Asbab", value: stats.content.asbabunNuzul },
    { name: "Topik", value: stats.content.topic },
    { name: "Surat", value: stats.content.surah },
  ].filter((d) => d.value > 0);

  const activityData = [
    { name: "Bookmark", value: stats.userActivity.bookmark },
    { name: "Hafalan", value: stats.userActivity.hafalan },
    { name: "Device", value: stats.userActivity.deviceTokens },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span>Ringkasan kondisi sistem & aktivitas pengguna.</span>
            {health && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isProd
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {health.node.env ?? "unknown"}
              </span>
            )}
          </span>
        }
        action={
          <RefreshButton
            onRefresh={() =>
              Promise.all([
                statsSwr.mutate(),
                healthSwr.mutate(),
                seedSwr.mutate(),
                auditSwr.mutate(),
              ])
            }
          />
        }
      />

      {runningSeed && (
        <Link
          href="/admin/seed"
          className="block rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 hover:bg-sky-50 transition"
        >
          <div className="flex items-start gap-3">
            <Loader2 size={18} className="text-sky-600 animate-spin mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sky-900 text-sm">
                Seed job sedang berjalan: {runningSeed.jobName}
              </p>
              <p className="text-xs text-sky-700 mt-0.5">
                {runningSeed.doneItems.toLocaleString("id-ID")} /{" "}
                {runningSeed.totalItems.toLocaleString("id-ID")} item · klik untuk
                buka monitor →
              </p>
            </div>
          </div>
        </Link>
      )}

      {!runningSeed && cancelledOrErrored.length > 0 && (
        <Link
          href="/admin/seed"
          className="block rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 hover:bg-amber-50 transition"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-900 text-sm">
                {cancelledOrErrored.length} seed job bisa dilanjutkan
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {cancelledOrErrored.map((s) => s.jobName).join(", ")} — klik Resume
                di halaman Seed untuk lanjut dari titik terakhir.
              </p>
            </div>
          </div>
        </Link>
      )}

      <section>
        <SectionHeader title="System status" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HealthTile
            icon={<Activity size={14} className="text-emerald-600" />}
            label="Uptime"
            value={health ? formatUptime(health.node.uptimeSeconds) : "—"}
            href="/admin/system"
            tone="ok"
          />
          <HealthTile
            icon={<Database size={14} className="text-indigo-600" />}
            label="Database"
            value={health?.database.size ?? "—"}
            href="/admin/system"
            tone="neutral"
          />
          <HealthTile
            icon={
              <Zap
                size={14}
                className={
                  health?.redis?.connected ? "text-emerald-600" : "text-rose-600"
                }
              />
            }
            label="Redis"
            value={
              health?.redis
                ? health.redis.connected
                  ? typeof health.redis.hitRate === "number"
                    ? `${health.redis.hitRate.toFixed(0)}% hit`
                    : "online"
                  : "offline"
                : "—"
            }
            tone={health?.redis?.connected === false ? "danger" : "ok"}
            href="/admin/system"
          />
          <HealthTile
            icon={
              <Cpu
                size={14}
                className={heapHigh ? "text-rose-600" : "text-emerald-600"}
              />
            }
            label="Heap"
            value={health ? `${heapPct.toFixed(0)}%` : "—"}
            tone={heapHigh ? "danger" : "ok"}
            href="/admin/system"
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Statistik utama" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Pengguna"
            value={stats.users.total}
            icon={Users}
            tone="emerald"
            hint={`${stats.users.admins.toLocaleString("id-ID")} admin`}
          />
          <StatCard
            label="Ayat"
            value={stats.content.ayat}
            icon={BookOpen}
            tone="indigo"
            hint={`${stats.content.surah} surat`}
          />
          <StatCard
            label="Tafsir"
            value={stats.content.tafsir}
            icon={ScrollText}
            tone="amber"
          />
          <StatCard
            label="Terjemahan"
            value={stats.content.translation}
            icon={Languages}
            tone="sky"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <SectionHeader
            title="Distribusi konten"
            description="Total record per jenis"
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={contentData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                >
                  {contentData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CONTENT_COLORS[i % CONTENT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number" ? v.toLocaleString("id-ID") : String(v ?? "")
                  }
                />
                <Legend
                  verticalAlign="bottom"
                  height={32}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <SectionHeader
            title="Aktivitas pengguna"
            description="Total interaksi tersimpan"
          />
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activityData}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number" ? v.toLocaleString("id-ID") : String(v ?? "")
                  }
                />
                <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
            <div className="inline-flex items-center justify-center gap-1.5">
              <Bookmark size={13} className="text-indigo-500" />
              <span className="text-slate-500">Bookmark:</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {stats.userActivity.bookmark.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="inline-flex items-center justify-center gap-1.5">
              <Brain size={13} className="text-indigo-500" />
              <span className="text-slate-500">Hafalan:</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {stats.userActivity.hafalan.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="inline-flex items-center justify-center gap-1.5">
              <Smartphone size={13} className="text-indigo-500" />
              <span className="text-slate-500">Device:</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {stats.userActivity.deviceTokens.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="Konten lainnya" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            label="Hadis"
            value={stats.content.hadis ?? 0}
            icon={ScrollText}
            tone="emerald"
            hint={
              stats.content.perawi
                ? `${stats.content.perawi} perawi`
                : "Belum di-seed"
            }
          />
          <StatCard
            label="Asmaul Husna"
            value={stats.content.asmaulHusna ?? 0}
            icon={Sparkles}
            tone="amber"
            hint="99 Nama Allah"
          />
          <StatCard
            label="Doa"
            value={stats.content.doa}
            icon={Library}
            tone="sky"
          />
          <StatCard
            label="Asbabun Nuzul"
            value={stats.content.asbabunNuzul}
            icon={FileText}
            tone="amber"
          />
          <StatCard
            label="Topik"
            value={stats.content.topic}
            icon={Tag}
            tone="indigo"
          />
        </div>
      </section>

      <section>
        <SectionHeader
          title="Jadwal sholat"
          description="Self-hosted dari myquran.com"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatCard
            label="Kota tersedia"
            value={stats.content.kota ?? 0}
            icon={Smartphone}
            tone="slate"
          />
          <StatCard
            label="Row jadwal di DB"
            value={stats.content.jadwalSholat ?? 0}
            icon={Clock}
            tone="indigo"
            hint="kota × hari yang sudah ke-cache"
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Aksi cepat" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/admin/users"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <Shield size={18} className="text-emerald-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">Kelola user</p>
            <p className="text-xs text-slate-500 mt-0.5">Promosi admin, detail</p>
          </Link>
          <Link
            href="/admin/broadcast"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <Bell size={18} className="text-indigo-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">Broadcast</p>
            <p className="text-xs text-slate-500 mt-0.5">Kirim notifikasi</p>
          </Link>
          <Link
            href="/admin/api-keys"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <KeyRound size={18} className="text-amber-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">API keys</p>
            <p className="text-xs text-slate-500 mt-0.5">Rotasi & izin</p>
          </Link>
          <Link
            href="/admin/snapshots"
            className="card p-4 hover:bg-slate-50 transition"
          >
            <Boxes size={18} className="text-sky-600 mb-1.5" />
            <p className="text-sm font-semibold text-slate-900">Snapshots</p>
            <p className="text-xs text-slate-500 mt-0.5">Backup & restore</p>
          </Link>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Audit log terbaru"
          action={
            <Link
              href="/admin/audit"
              className="text-xs text-indigo-600 font-semibold inline-flex items-center gap-1 hover:underline"
            >
              Lihat semua <ExternalLink size={12} />
            </Link>
          }
        />
        {auditSwr.isLoading && recentAudit.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">
            Memuat audit log…
          </div>
        ) : recentAudit.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">
            Belum ada aktivitas admin.
          </div>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {recentAudit.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                <span
                  className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${verbTone(entry.action)}`}
                >
                  {entry.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">
                    {entry.actorEmail ?? "—"}
                    {entry.target && (
                      <span className="text-slate-500"> → {entry.target}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 inline-flex items-center gap-1 mt-0.5">
                    <Clock size={11} /> {fmtRelative(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
