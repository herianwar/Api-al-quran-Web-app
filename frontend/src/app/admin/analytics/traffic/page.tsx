"use client";

import {
  Activity,
  Eye,
  Globe,
  Link2,
  Monitor,
  Smartphone,
  Tablet,
  TrendingUp,
  Users,
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
import { fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { StatCard } from "@/components/admin/StatCard";

interface Traffic {
  rangeDays: number;
  headline: {
    totalRange: number;
    totalToday: number;
    uniqueRange: number;
    uniqueToday: number;
    realtimeActive: number;
    anonShare: number;
    authedShare: number;
  };
  daily: { date: string; views: number; uniques: number }[];
  topPaths: { path: string; views: number }[];
  topReferrers: { referer: string; views: number }[];
  deviceSplit: { device: string; views: number }[];
  browserSplit: { browser: string; views: number }[];
  osSplit: { os: string; views: number }[];
  countrySplit: { country: string; views: number }[];
}

interface Realtime {
  activeNow: number;
  topPaths: { path: string; views: number }[];
  windowSeconds: number;
}

const RANGES = [
  { value: 1, label: "24 jam" },
  { value: 7, label: "7 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
] as const;

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#10b981",
  desktop: "#6366f1",
  tablet: "#f59e0b",
  bot: "#94a3b8",
};
const BROWSER_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9", "#a855f7", "#f43f5e", "#84cc16"];

function shortenReferer(r: string): string {
  try {
    const u = new URL(r);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return r.slice(0, 40);
  }
}

function fmt(n: number): string {
  return n.toLocaleString("id-ID");
}

function deviceIcon(d: string) {
  if (d === "mobile") return Smartphone;
  if (d === "tablet") return Tablet;
  return Monitor;
}

export default function AdminTrafficAnalyticsPage() {
  const [range, setRange] = useState<number>(7);
  const { data, error, isLoading, mutate } = useSWR<Traffic>(
    `/admin/analytics/traffic?range=${range}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const { data: realtime } = useSWR<Realtime>(
    "/admin/analytics/traffic/realtime",
    fetcher,
    { refreshInterval: 10_000 },
  );

  if (isLoading && !data) return <Spinner label="Memuat analytics…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  const totalDevice = data.deviceSplit.reduce((s, d) => s + d.views, 0);

  return (
    <>
      <PageHeader
        title="Traffic Web"
        description="Page views & unique visitors di rumahquran.id (tracking first-party, tanpa cookie pihak ketiga)."
        action={
          <div className="flex items-center gap-2">
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
            <RefreshButton onRefresh={() => void mutate()} />
          </div>
        }
      />

      {/* Realtime banner */}
      <div className="card p-4 sm:p-5 bg-gradient-to-br from-emerald-600 to-teal-600 text-white mb-5">
        <div className="flex items-center gap-3">
          <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white/15">
            <Activity size={18} />
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-300 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-300" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-50/90">
              Realtime (5 menit terakhir)
            </p>
            <p className="text-2xl sm:text-3xl font-bold mt-0.5 tabular-nums">
              {fmt(realtime?.activeNow ?? 0)} pengunjung aktif
            </p>
          </div>
        </div>
        {realtime && realtime.topPaths.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {realtime.topPaths.slice(0, 6).map((p) => (
              <li
                key={p.path}
                className="text-xs bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-1"
              >
                <span className="font-mono">{p.path}</span>
                <span className="ml-1 opacity-75">· {p.views}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Eye}
          tone="emerald"
          label="Page views"
          value={fmt(data.headline.totalRange)}
          hint={`${RANGES.find((r) => r.value === range)?.label} · hari ini ${fmt(data.headline.totalToday)}`}
        />
        <StatCard
          icon={Users}
          tone="indigo"
          label="Unique visitor"
          value={fmt(data.headline.uniqueRange)}
          hint={`Hari ini ${fmt(data.headline.uniqueToday)}`}
        />
        <StatCard
          icon={TrendingUp}
          tone="amber"
          label="Login share"
          value={`${data.headline.authedShare}%`}
          hint={`Anonim ${data.headline.anonShare}%`}
        />
        <StatCard
          icon={Activity}
          tone="rose"
          label="Per visitor"
          value={
            data.headline.uniqueRange > 0
              ? (data.headline.totalRange / data.headline.uniqueRange).toFixed(1)
              : "—"
          }
          hint="Page / sesi rata-rata"
        />
      </div>

      {/* Daily trend */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900">Trend harian</h2>
          <span className="text-xs text-slate-500">
            {data.daily.length} hari data
          </span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.daily} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
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
                dataKey="views"
                stroke="#10b981"
                fill="url(#gv)"
                strokeWidth={2}
                name="Views"
              />
              <Area
                type="monotone"
                dataKey="uniques"
                stroke="#6366f1"
                fill="url(#gu)"
                strokeWidth={2}
                name="Unique"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top pages + referrers */}
      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <Eye size={16} /> Top halaman
          </h2>
          {data.topPaths.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada data.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.topPaths.map((p) => {
                const max = data.topPaths[0]?.views ?? 1;
                const pct = (p.views / max) * 100;
                return (
                  <li key={p.path}>
                    <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
                      <span className="font-mono text-slate-700 truncate">{p.path}</span>
                      <span className="font-semibold tabular-nums">{fmt(p.views)}</span>
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
            <Link2 size={16} /> Top referrer
          </h2>
          {data.topReferrers.length === 0 ? (
            <p className="text-sm text-slate-400">
              Belum ada traffic dari luar tercatat.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.topReferrers.map((r) => (
                <li
                  key={r.referer}
                  className="flex items-center justify-between text-xs"
                >
                  <a
                    href={r.referer}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-emerald-700 hover:underline truncate"
                    title={r.referer}
                  >
                    {shortenReferer(r.referer)}
                  </a>
                  <span className="font-semibold tabular-nums ml-3">
                    {fmt(r.views)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Device + browser + OS + country */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <Monitor size={16} /> Device
          </h2>
          {data.deviceSplit.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada data.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.deviceSplit}
                      dataKey="views"
                      nameKey="device"
                      innerRadius={32}
                      outerRadius={64}
                      paddingAngle={2}
                    >
                      {data.deviceSplit.map((d) => (
                        <Cell
                          key={d.device}
                          fill={DEVICE_COLORS[d.device] ?? "#94a3b8"}
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
              </div>
              <ul className="space-y-1.5 text-sm">
                {data.deviceSplit.map((d) => {
                  const Icon = deviceIcon(d.device);
                  const pct = totalDevice > 0 ? (d.views / totalDevice) * 100 : 0;
                  return (
                    <li
                      key={d.device}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        <Icon
                          size={14}
                          style={{ color: DEVICE_COLORS[d.device] ?? "#94a3b8" }}
                        />
                        {d.device}
                      </span>
                      <span className="text-slate-500 tabular-nums">
                        {fmt(d.views)} · {pct.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <Globe size={16} /> Browser, OS &amp; Negara
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <Bucket title="Browser" items={data.browserSplit.map((b) => ({ k: b.browser, v: b.views }))} />
            <Bucket title="OS" items={data.osSplit.map((b) => ({ k: b.os, v: b.views }))} />
            <Bucket title="Negara" items={data.countrySplit.map((b) => ({ k: b.country, v: b.views }))} />
          </div>
        </div>
      </div>
    </>
  );
}

function Bucket({
  title,
  items,
}: {
  title: string;
  items: { k: string; v: number }[];
}) {
  const total = items.reduce((s, i) => s + i.v, 0);
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        {title}
      </p>
      <ul className="space-y-1">
        {items.slice(0, 8).map((i, idx) => {
          const pct = total > 0 ? (i.v / total) * 100 : 0;
          return (
            <li key={`${i.k}-${idx}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="capitalize truncate">{i.k}</span>
                <span className="text-slate-500 tabular-nums whitespace-nowrap">
                  {fmt(i.v)}
                </span>
              </div>
              <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${pct}%`,
                    background: BROWSER_COLORS[idx % BROWSER_COLORS.length],
                  }}
                />
              </div>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="text-slate-400">Belum ada data.</li>
        )}
      </ul>
    </div>
  );
}
