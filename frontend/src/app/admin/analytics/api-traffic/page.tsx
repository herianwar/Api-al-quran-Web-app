"use client";

import {
  Activity,
  AlertTriangle,
  Download,
  Gauge,
  Layers,
  Smartphone,
  Timer,
  Zap,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetcher, apiFetchRaw } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { StatCard } from "@/components/admin/StatCard";

interface ApiUsage {
  rangeDays: number;
  retentionDays: number;
  headline: {
    totalRange: number;
    totalToday: number;
    errorRange: number;
    errorRatePct: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    activeApps: number;
    trend: { requests: number; errorRate: number; latency: number };
  };
  alerts: { type: string; appName: string; detail: string }[];
  daily: { date: string; requests: number; errors: number }[];
  apps: {
    apiKeyId: string;
    appName: string;
    requests: number;
    errors: number;
    errorRatePct: number;
    avgLatencyMs: number;
    rateLimit: number;
    peakRpm: number;
  }[];
  platforms: { platform: string; requests: number }[];
  statusClasses: { klass: string; requests: number }[];
  topEndpoints: {
    method: string;
    endpoint: string;
    requests: number;
    avgLatencyMs: number;
    errorRatePct: number;
  }[];
  recentErrors: {
    createdAt: string;
    method: string;
    endpoint: string;
    statusCode: number;
    appName: string;
  }[];
}

const RANGES = [
  { value: 1, label: "24 jam" },
  { value: 7, label: "7 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
] as const;

const PLATFORM_COLORS: Record<string, string> = {
  web: "#6366f1",
  android: "#10b981",
  ios: "#0ea5e9",
  server: "#f59e0b",
  other: "#94a3b8",
};
const STATUS_COLORS: Record<string, string> = {
  "2xx": "#10b981",
  "3xx": "#0ea5e9",
  "4xx": "#f59e0b",
  "5xx": "#ef4444",
  other: "#94a3b8",
};
const METHOD_COLORS: Record<string, string> = {
  GET: "#0ea5e9",
  POST: "#10b981",
  PUT: "#f59e0b",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
};

function fmt(n: number): string {
  return n.toLocaleString("id-ID");
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}%`;
}

const ALERT_LABEL: Record<string, string> = {
  stale: "App tidak aktif",
  error_spike: "Lonjakan error",
  rate_limit: "Lewat rate limit",
};

export default function AdminApiTrafficPage() {
  const [range, setRange] = useState<number>(7);
  const [appId, setAppId] = useState<string>("");

  const qs = `range=${range}${appId ? `&appId=${encodeURIComponent(appId)}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<ApiUsage>(
    `/admin/analytics/api?${qs}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  // Unfiltered call purely to keep the app dropdown fully populated even when a
  // filter is active.
  const { data: all } = useSWR<ApiUsage>(
    `/admin/analytics/api?range=${range}`,
    fetcher,
  );

  async function exportCsv() {
    try {
      const res = await apiFetchRaw(`/admin/analytics/api/export?${qs}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `api-usage-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(`Export gagal: ${(e as Error).message}`);
    }
  }

  if (isLoading && !data) return <Spinner label="Memuat API analytics…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  const appOptions = (all?.apps ?? data.apps).map((a) => ({
    id: a.apiKeyId,
    name: a.appName,
  }));
  const totalPlatform = data.platforms.reduce((s, p) => s + p.requests, 0);
  const totalStatus = data.statusClasses.reduce((s, p) => s + p.requests, 0);

  return (
    <>
      <PageHeader
        title="Traffic API"
        description="Penggunaan API per aplikasi (web, Android, iOS). Hanya request dengan API key yang tercatat; panel admin & health check tidak dihitung."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="">Semua app</option>
              {appOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    range === r.value
                      ? "bg-white shadow text-slate-900"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void exportCsv()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition shadow-sm"
            >
              <Download size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <RefreshButton onRefresh={() => void mutate()} />
          </div>
        }
      />

      {data.alerts.length > 0 && (
        <div className="card p-4 my-4 border-l-4 border-amber-400 bg-amber-50">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2 inline-flex items-center gap-1.5">
            <AlertTriangle size={14} /> Peringatan ({data.alerts.length})
          </p>
          <ul className="space-y-1 text-sm text-amber-900">
            {data.alerts.map((al, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 whitespace-nowrap mt-0.5">
                  {ALERT_LABEL[al.type] ?? al.type}
                </span>
                <span>
                  <span className="font-semibold">{al.appName}</span> — {al.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-5">
        <StatCard
          icon={Zap}
          tone="emerald"
          label="Total request"
          value={fmt(data.headline.totalRange)}
          hint={`hari ini ${fmt(data.headline.totalToday)} · ${signed(data.headline.trend.requests)} vs periode lalu`}
          trend={data.headline.trend.requests}
        />
        <StatCard
          icon={AlertTriangle}
          tone={data.headline.errorRatePct >= 5 ? "rose" : "amber"}
          label="Error rate"
          value={`${data.headline.errorRatePct}%`}
          hint={`${fmt(data.headline.errorRange)} error · ${signed(data.headline.trend.errorRate)} vs lalu`}
        />
        <StatCard
          icon={Timer}
          tone="indigo"
          label="Latency rata-rata"
          value={`${fmt(data.headline.avgLatencyMs)} ms`}
          hint={`p95 ${fmt(data.headline.p95LatencyMs)} ms · ${signed(data.headline.trend.latency)} vs lalu`}
        />
        <StatCard
          icon={Smartphone}
          tone="sky"
          label="App aktif"
          value={fmt(data.headline.activeApps)}
          hint="Punya API key & traffic"
        />
      </div>

      {/* Daily trend */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
            <Activity size={16} /> Request harian
          </h2>
          <span className="text-xs text-slate-500">{data.daily.length} hari</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data.daily}
              margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
            >
              <defs>
                <linearGradient id="areq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="aerr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip
                formatter={(v) =>
                  typeof v === "number" ? v.toLocaleString("id-ID") : String(v ?? "")
                }
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="#10b981"
                fill="url(#areq)"
                strokeWidth={2}
                name="Request"
              />
              <Area
                type="monotone"
                dataKey="errors"
                stroke="#ef4444"
                fill="url(#aerr)"
                strokeWidth={2}
                name="Error"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-app + platform/status */}
      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <Layers size={16} /> Per aplikasi
          </h2>
          {data.apps.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada data.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.apps.map((a) => {
                const max = data.apps[0]?.requests || 1;
                const pct = (a.requests / max) * 100;
                return (
                  <li key={a.apiKeyId}>
                    <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
                      <button
                        onClick={() =>
                          setAppId(appId === a.apiKeyId ? "" : a.apiKeyId)
                        }
                        className={`font-semibold truncate text-left hover:underline ${
                          appId === a.apiKeyId ? "text-emerald-700" : "text-slate-700"
                        }`}
                        title="Filter ke app ini"
                      >
                        {a.appName}
                      </button>
                      <span className="tabular-nums whitespace-nowrap text-slate-500">
                        {fmt(a.requests)} req · {a.errorRatePct}% err ·{" "}
                        {fmt(a.avgLatencyMs)} ms ·{" "}
                        {a.rateLimit > 0 ? (
                          <span
                            className={
                              a.peakRpm > a.rateLimit
                                ? "text-rose-600 font-semibold"
                                : ""
                            }
                          >
                            {a.peakRpm}/{a.rateLimit} rpm
                          </span>
                        ) : (
                          <span title="tanpa limit per-key">∞ rpm</span>
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <Gauge size={16} /> Platform &amp; status
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="h-40">
              {data.platforms.length === 0 ? (
                <p className="text-sm text-slate-400">Belum ada data.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.platforms}
                      dataKey="requests"
                      nameKey="platform"
                      innerRadius={30}
                      outerRadius={60}
                      paddingAngle={2}
                    >
                      {data.platforms.map((p) => (
                        <Cell
                          key={p.platform}
                          fill={PLATFORM_COLORS[p.platform] ?? "#94a3b8"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) =>
                        typeof v === "number"
                          ? v.toLocaleString("id-ID")
                          : String(v ?? "")
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="space-y-2.5 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Platform
                </p>
                <ul className="space-y-1">
                  {data.platforms.map((p) => (
                    <li
                      key={p.platform}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            background: PLATFORM_COLORS[p.platform] ?? "#94a3b8",
                          }}
                        />
                        {p.platform}
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {totalPlatform > 0
                          ? `${Math.round((p.requests / totalPlatform) * 100)}%`
                          : "0%"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Status (7 hari)
                </p>
                <ul className="space-y-1">
                  {data.statusClasses.map((s) => (
                    <li
                      key={s.klass}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: STATUS_COLORS[s.klass] ?? "#94a3b8" }}
                        />
                        {s.klass}
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {fmt(s.requests)}
                        {totalStatus > 0
                          ? ` · ${Math.round((s.requests / totalStatus) * 100)}%`
                          : ""}
                      </span>
                    </li>
                  ))}
                  {data.statusClasses.length === 0 && (
                    <li className="text-slate-400">Belum ada data.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top endpoints + recent errors */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <Zap size={16} /> Endpoint teratas{" "}
            <span className="text-xs font-normal text-slate-400">
              (maks {data.retentionDays} hari)
            </span>
          </h2>
          {data.topEndpoints.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada data.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.topEndpoints.map((e) => {
                const max = data.topEndpoints[0]?.requests || 1;
                const pct = (e.requests / max) * 100;
                return (
                  <li key={`${e.method} ${e.endpoint}`}>
                    <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
                      <span className="truncate inline-flex items-center gap-1.5 min-w-0">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white shrink-0"
                          style={{
                            background: METHOD_COLORS[e.method] ?? "#64748b",
                          }}
                        >
                          {e.method}
                        </span>
                        <span className="font-mono text-slate-700 truncate">
                          {e.endpoint}
                        </span>
                      </span>
                      <span className="tabular-nums whitespace-nowrap text-slate-500">
                        {fmt(e.requests)} · {fmt(e.avgLatencyMs)} ms
                        {e.errorRatePct > 0 ? ` · ${e.errorRatePct}% err` : ""}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <AlertTriangle size={16} /> Error terbaru
          </h2>
          {data.recentErrors.length === 0 ? (
            <p className="text-sm text-slate-400">Tidak ada error tercatat. 🎉</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {data.recentErrors.map((e, i) => (
                <li
                  key={`${e.createdAt}-${i}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate inline-flex items-center gap-1.5 min-w-0">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        e.statusCode >= 500
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {e.statusCode}
                    </span>
                    <span className="font-mono text-slate-600 truncate">
                      {e.method} {e.endpoint}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-slate-400">
                    {e.appName} ·{" "}
                    {new Date(e.createdAt).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
