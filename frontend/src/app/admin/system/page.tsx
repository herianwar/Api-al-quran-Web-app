"use client";

import {
  Activity,
  AlertTriangle,
  Archive,
  Cpu,
  Database,
  HardDrive,
  Server,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";

interface Health {
  database: {
    size: string;
    tables: { name: string; size: string; rows: number }[];
  };
  audioCache: { bytes: number; files: number; pretty: string } | null;
  snapshots: { count: number; dir: string };
  redis: {
    connected: boolean;
    memory?: string;
    keys?: number;
    hitRate?: number;
  } | null;
  disk?: {
    app: {
      totalBytes: number;
      pretty: string;
      items: { name: string; path: string; bytes: number; pretty: string }[];
    };
    vps: {
      totalBytes: number;
      usedBytes: number;
      availableBytes: number;
      usedPct: number;
      mount: string;
      pretty: { total: string; used: string; available: string };
    } | null;
  };
  node: {
    uptimeSeconds: number;
    memoryUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    version: string;
    env: string;
  };
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KiB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MiB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function formatAgo(secAgo: number): string {
  if (secAgo < 5) return "baru saja";
  if (secAgo < 60) return `${secAgo} detik lalu`;
  const m = Math.floor(secAgo / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  return `${h} jam lalu`;
}

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9"];

export default function AdminSystemPage() {
  // Polling at 30s + server-side 15s cache → walkDir + pg_class scan run at
  // most ~2x/min instead of every 10s.
  const { data, error, isLoading, mutate } = useSWR<Health>(
    "/admin/system",
    fetcher,
    { refreshInterval: 30_000 },
  );

  // Track last successful update to render a "diperbarui X detik lalu" hint
  // that refreshes once per second without re-fetching.
  const [lastUpdated, setLastUpdated] = useState<number>(() => Date.now());
  const [, force] = useState(0);
  useEffect(() => {
    if (data) setLastUpdated(Date.now());
  }, [data]);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (isLoading && !data) return <Spinner label="Memuat health…" />;
  if (error && !data) return <ErrorBox message={error.message} />;
  if (!data) return null;

  const heapTotal = data.node.memoryUsage.heapTotal || 1;
  const heapPct = (data.node.memoryUsage.heapUsed / heapTotal) * 100;
  const heapHigh = heapPct > 85;
  const isProd = data.node.env === "production";

  // Top 5 tables for pie chart; truncate long names so labels don't bleed.
  const topTables = data.database.tables.slice(0, 5).map((t) => ({
    name: t.name,
    short: t.name.length > 11 ? t.name.slice(0, 11) + "…" : t.name,
    value: t.rows,
  }));

  const secAgo = Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000));

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Health"
        description={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span>Status sistem realtime · diperbarui {formatAgo(secAgo)}.</span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                isProd
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {data.node.env ?? "unknown"}
            </span>
          </span>
        }
        action={<RefreshButton onRefresh={() => mutate()} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon={Server}
          tone="emerald"
          label="Uptime"
          value={formatUptime(data.node.uptimeSeconds)}
          hint={`Node ${data.node.version}`}
        />
        <MetricCard
          icon={Database}
          tone="indigo"
          label="DB Size"
          value={data.database.size}
          hint={`${data.database.tables.length} tabel`}
        />
        <MetricCard
          icon={Zap}
          tone={data.redis?.connected ? "amber" : "rose"}
          label="Redis"
          value={
            data.redis?.connected
              ? `${data.redis.hitRate?.toFixed(1) ?? "0"}%`
              : "Down"
          }
          hint={
            data.redis?.connected
              ? `hit rate · ${(data.redis.keys ?? 0).toLocaleString("id-ID")} keys`
              : "tidak konek"
          }
          danger={!data.redis?.connected}
        />
        <MetricCard
          icon={HardDrive}
          tone="sky"
          label="Audio Cache"
          value={data.audioCache?.pretty ?? "—"}
          hint={
            data.audioCache
              ? `${data.audioCache.files.toLocaleString("id-ID")} file`
              : "tidak terdeteksi"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Memory usage */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-emerald-600" />
              <h2 className="font-semibold text-slate-900">Memory usage</h2>
            </div>
            {heapHigh && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                <AlertTriangle size={11} /> heap tinggi
              </span>
            )}
          </div>
          <div className="space-y-3">
            <MemBar
              label="Heap used"
              value={data.node.memoryUsage.heapUsed}
              max={heapTotal}
              tone={heapPct > 85 ? "rose" : heapPct > 60 ? "amber" : "emerald"}
            />
            <Stat
              label="RSS (Resident Set Size)"
              value={formatBytes(data.node.memoryUsage.rss)}
            />
            <Stat
              label="External"
              value={formatBytes(data.node.memoryUsage.external)}
            />
            {data.redis?.memory && (
              <Stat label="Redis memory" value={data.redis.memory} />
            )}
          </div>
        </div>

        {/* Top tables pie */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Database size={16} className="text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Top 5 tabel by rows</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Distribusi data antar tabel utama (perkiraan dari{" "}
            <code className="font-mono text-[11px]">pg_class.reltuples</code>).
          </p>
          {topTables.length === 0 ||
          topTables.every((t) => t.value === 0) ? (
            <p className="text-sm text-slate-500 py-12 text-center">
              Belum ada data tabel.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={topTables}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={2}
                  label={(e: { payload?: { short?: string } }) =>
                    e.payload?.short ?? ""
                  }
                  labelLine={false}
                >
                  {topTables.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                  }}
                  formatter={(v, _name, item) => [
                    Number(v).toLocaleString("id-ID") + " rows",
                    (item?.payload as { name?: string } | undefined)?.name ??
                      "Rows",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Storage / snapshots quick info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <Archive size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Snapshots
            </p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">
              {data.snapshots.count.toLocaleString("id-ID")} file
            </p>
            <p className="text-[11px] font-mono text-slate-400 truncate">
              {data.snapshots.dir}
            </p>
          </div>
          <Link
            href="/admin/snapshots"
            className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Kelola →
          </Link>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <HardDrive size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Audio cache disk
            </p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">
              {data.audioCache?.pretty ?? "—"}
              {data.audioCache && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  · {data.audioCache.files.toLocaleString("id-ID")} file
                </span>
              )}
            </p>
            <p className="text-[11px] text-slate-400">
              Dibersihkan otomatis bila terlalu besar.
            </p>
          </div>
        </div>
      </div>

      {/* Disk usage breakdown */}
      {data.disk && (
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <HardDrive size={16} className="text-slate-600" />
              <h2 className="font-semibold text-slate-900">Penggunaan Disk</h2>
            </div>
            {data.disk.vps && (
              <span className="text-xs text-slate-500 tabular-nums">
                VPS: {data.disk.vps.pretty.used} dari {data.disk.vps.pretty.total} ({data.disk.vps.usedPct}%)
              </span>
            )}
          </div>

          {data.disk.vps && (
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">Disk VPS — mount {data.disk.vps.mount}</span>
                <span className="font-semibold text-slate-700">
                  Sisa: {data.disk.vps.pretty.available}
                </span>
              </div>
              <div className="h-3 rounded-full overflow-hidden bg-slate-100">
                <div
                  className={`h-full transition-all ${
                    data.disk.vps.usedPct >= 90
                      ? "bg-rose-500"
                      : data.disk.vps.usedPct >= 75
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, data.disk.vps.usedPct)}%` }}
                />
              </div>
            </div>
          )}

          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Direktori aplikasi (total {data.disk.app.pretty})
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {process.env.NEXT_PUBLIC_API_URL ?? ""}
            </span>
          </div>
          <ul className="space-y-1.5">
            {data.disk.app.items.map((it) => {
              const pct =
                data.disk!.app.totalBytes > 0
                  ? (it.bytes / data.disk!.app.totalBytes) * 100
                  : 0;
              return (
                <li key={it.name}>
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-medium text-slate-700 truncate">
                      {it.name}
                    </span>
                    <span className="text-slate-500 tabular-nums whitespace-nowrap">
                      {it.pretty}{" "}
                      <span className="text-slate-400">
                        ({pct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-slate-100">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                    {it.path}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* All tables — table on desktop, cards on mobile */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-slate-600" />
          <h2 className="font-semibold text-slate-900">Semua tabel Postgres</h2>
          <span className="ml-auto inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 tabular-nums">
            {data.database.tables.length}
          </span>
        </div>

        {/* Desktop */}
        <div className="hidden md:block card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Tabel</th>
                  <th className="px-4 py-2 text-right">Rows</th>
                  <th className="px-4 py-2 text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {data.database.tables.map((t) => (
                  <tr key={t.name} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs text-slate-900 break-all">
                      {t.name}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                      {t.rows.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {t.size}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile */}
        <ul className="md:hidden card divide-y divide-slate-100 overflow-hidden">
          {data.database.tables.map((t) => (
            <li key={t.name} className="px-4 py-2.5 flex items-center gap-3">
              <span className="font-mono text-xs text-slate-900 truncate flex-1">
                {t.name}
              </span>
              <span className="shrink-0 text-xs text-slate-500">{t.size}</span>
              <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
                {t.rows.toLocaleString("id-ID")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  danger,
}: {
  icon: typeof Server;
  tone: "emerald" | "indigo" | "amber" | "sky" | "rose";
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  const toneCls = {
    emerald: "text-emerald-600",
    indigo: "text-indigo-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
    rose: "text-rose-600",
  }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={toneCls} />
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
      </div>
      <p
        className={`text-2xl font-bold tabular-nums ${
          danger ? "text-rose-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-slate-500 mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

function MemBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color =
    tone === "rose"
      ? "bg-rose-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1 flex-wrap gap-x-2">
        <span className="text-slate-600">{label}</span>
        <span className="font-mono text-slate-900 tabular-nums">
          {formatBytes(value)} / {formatBytes(max)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-xs gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}
