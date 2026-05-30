"use client";

import {
  Bell,
  Bookmark,
  Brain,
  CheckCircle2,
  RotateCcw,
  Smartphone,
  XCircle,
} from "lucide-react";
import useSWR from "swr";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { StatCard } from "@/components/admin/StatCard";

interface EngagementAna {
  bookmarksTrend: { day: string; count: number }[];
  hafalanTrend: { day: string; count: number }[];
  reviewsTrend: { day: string; count: number }[];
  platforms: { platform: string; count: number }[];
  broadcasts: {
    id: string;
    title: string;
    attempted: number;
    successful: number;
    failed: number;
    successRate: number;
    createdAt: string;
  }[];
}

const PLATFORM_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899"];

function mergeTrends(
  bookmarks: { day: string; count: number }[],
  hafalan: { day: string; count: number }[],
  reviews: { day: string; count: number }[],
) {
  const days = new Set<string>([
    ...bookmarks.map((r) => r.day),
    ...hafalan.map((r) => r.day),
    ...reviews.map((r) => r.day),
  ]);
  const bm = new Map(bookmarks.map((r) => [r.day, r.count]));
  const hf = new Map(hafalan.map((r) => [r.day, r.count]));
  const rv = new Map(reviews.map((r) => [r.day, r.count]));
  return Array.from(days)
    .sort()
    .map((day) => ({
      day,
      label: new Date(day).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      }),
      bookmark: bm.get(day) ?? 0,
      hafalan: hf.get(day) ?? 0,
      review: rv.get(day) ?? 0,
    }));
}

function RateBadge({ rate }: { rate: number }) {
  const cls =
    rate >= 90
      ? "bg-emerald-100 text-emerald-700"
      : rate >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}
    >
      {rate}%
    </span>
  );
}

export default function EngagementAnalyticsPage() {
  const { data, error, isLoading, mutate } = useSWR<EngagementAna>(
    "/admin/analytics/engagement",
    fetcher,
  );

  if (isLoading) return <Spinner label="Memuat engagement…" />;
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return null;

  const trend = mergeTrends(
    data.bookmarksTrend,
    data.hafalanTrend,
    data.reviewsTrend,
  );

  const totals = {
    bookmark: data.bookmarksTrend.reduce((s, d) => s + d.count, 0),
    hafalan: data.hafalanTrend.reduce((s, d) => s + d.count, 0),
    review: data.reviewsTrend.reduce((s, d) => s + d.count, 0),
  };

  const broadcastChart = data.broadcasts
    .slice()
    .reverse()
    .map((b, i) => ({
      idx: i + 1,
      title: b.title,
      when: new Date(b.createdAt).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      rate: b.successRate,
      attempted: b.attempted,
    }));

  return (
    <>
      <PageHeader
        title="Engagement Analytics"
        description="Aktivitas user 30 hari terakhir: bookmark, hafalan, review, push delivery."
        action={<RefreshButton onRefresh={() => mutate()} />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Bookmark 30 hari"
          value={totals.bookmark}
          icon={Bookmark}
          tone="amber"
        />
        <StatCard
          label="Hafalan baru 30 hari"
          value={totals.hafalan}
          icon={Brain}
          tone="emerald"
        />
        <StatCard
          label="Review 30 hari"
          value={totals.review}
          icon={RotateCcw}
          tone="indigo"
        />
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-1">
          Aktivitas harian 30 hari
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Bookmark dibuat, hafalan baru, dan review hafalan per hari.
        </p>
        {trend.length === 0 ? (
          <p className="text-sm text-slate-500 py-12 text-center">
            Belum ada aktivitas user.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={trend}
              margin={{ top: 5, right: 12, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="bm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="hf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#cbd5e1" }}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#cbd5e1" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ paddingTop: 8, fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="bookmark"
                name="Bookmark"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#bm)"
              />
              <Area
                type="monotone"
                dataKey="hafalan"
                name="Hafalan baru"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#hf)"
              />
              <Area
                type="monotone"
                dataKey="review"
                name="Review"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#rv)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Platform breakdown */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone size={16} className="text-sky-600" />
            <h2 className="font-semibold text-slate-900">Platform device</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Push notification target per platform.
          </p>
          {data.platforms.length === 0 ? (
            <p className="text-sm text-slate-500 py-12 text-center">
              Belum ada device terdaftar.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data.platforms}
                  dataKey="count"
                  nameKey="platform"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={3}
                  label={(e: { payload?: { platform?: string; count?: number } }) =>
                    `${e.payload?.platform ?? ""}: ${e.payload?.count ?? 0}`
                  }
                  labelLine={false}
                >
                  {data.platforms.map((_, i) => (
                    <Cell
                      key={i}
                      fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Broadcast performance */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={16} className="text-emerald-600" />
            <h2 className="font-semibold text-slate-900">
              Broadcast delivery rate
            </h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Success rate 20 broadcast terakhir.
          </p>
          {broadcastChart.length === 0 ? (
            <p className="text-sm text-slate-500 py-12 text-center">
              Belum ada broadcast terkirim.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={broadcastChart}
                margin={{ top: 5, right: 12, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="idx"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                  }}
                  // Show broadcast title + send time on hover so admin knows
                  // which broadcast each point represents.
                  labelFormatter={(_idx, payload) => {
                    const p = payload?.[0]?.payload as
                      | { title?: string; when?: string }
                      | undefined;
                    return p?.title
                      ? `${p.title}${p.when ? ` · ${p.when}` : ""}`
                      : `#${_idx as number}`;
                  }}
                  formatter={(v) => [`${v}%`, "Success rate"] as [string, string]}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#10b981" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Broadcast list */}
      <section>
        <SectionHeader
          title="Broadcast terbaru"
          description="20 push notification terakhir dengan delivery stat."
        />
        {data.broadcasts.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Belum ada broadcast"
            description="Kirim broadcast push dari halaman Broadcast — history & delivery stats tampil di sini."
          />
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Judul</th>
                      <th className="px-4 py-2.5 text-right">Diupayakan</th>
                      <th className="px-4 py-2.5 text-right">Sukses</th>
                      <th className="px-4 py-2.5 text-right">Gagal</th>
                      <th className="px-4 py-2.5 text-right">Rate</th>
                      <th className="px-4 py-2.5 text-left">Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.broadcasts.map((b) => (
                      <tr
                        key={b.id}
                        className="border-t border-slate-100 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-2.5 font-semibold text-slate-900 max-w-[240px] truncate">
                          {b.title}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                          {b.attempted}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 size={12} />
                            {b.successful}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {b.failed > 0 ? (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                              <XCircle size={12} />
                              {b.failed}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <RateBadge rate={b.successRate} />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(b.createdAt).toLocaleString("id-ID")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: cards */}
            <ul className="md:hidden space-y-2">
              {data.broadcasts.map((b) => (
                <li key={b.id} className="card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900 text-sm truncate flex-1">
                      {b.title}
                    </h3>
                    <RateBadge rate={b.successRate} />
                  </div>
                  <div className="mt-2 flex items-center gap-x-3 gap-y-1 text-xs flex-wrap">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <CheckCircle2 size={11} /> {b.successful}
                    </span>
                    {b.failed > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                        <XCircle size={11} /> {b.failed}
                      </span>
                    )}
                    <span className="text-slate-500">
                      {b.attempted} target
                    </span>
                    <span className="ml-auto text-slate-400">
                      {new Date(b.createdAt).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
