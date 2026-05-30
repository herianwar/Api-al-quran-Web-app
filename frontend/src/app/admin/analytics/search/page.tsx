"use client";

import { BarChart3, Hash, Search, SearchX, TrendingUp } from "lucide-react";
import useSWR from "swr";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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

interface Analytics {
  topQueries: {
    query: string;
    lang: string;
    count: number;
    avgResults: number;
  }[];
  noResultQueries: { query: string; lang: string; count: number }[];
  last7Days: { day: string; count: number }[];
}

export default function AdminAnalyticsPage() {
  const { data, error, isLoading, mutate } = useSWR<Analytics>(
    "/admin/analytics/search",
    fetcher,
  );

  if (isLoading) return <Spinner label="Memuat analytics…" />;
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return null;

  const totalSearches = data.last7Days.reduce((sum, d) => sum + d.count, 0);

  // Format day for tooltip/axis
  const trendData = data.last7Days.map((d) => ({
    ...d,
    label: new Date(d.day).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    }),
  }));

  const topChartData = data.topQueries.slice(0, 10).map((q) => ({
    name: q.query.length > 18 ? q.query.slice(0, 18) + "…" : q.query,
    count: q.count,
  }));

  return (
    <>
      <PageHeader
        title="Search Analytics"
        description={`Pelajari apa yang user cari. Query "no-result" menunjukkan gap konten yang perlu diisi.`}
        action={<RefreshButton onRefresh={() => mutate()} />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Pencarian 7 hari"
          value={totalSearches}
          icon={Search}
          tone="emerald"
          hint="total query"
        />
        <StatCard
          label="Unique queries"
          value={data.topQueries.length}
          icon={Hash}
          tone="indigo"
          hint="top 30"
        />
        <StatCard
          label="No-result gaps"
          value={data.noResultQueries.length}
          icon={SearchX}
          tone="rose"
          hint="query 0 hasil"
        />
      </div>

      {/* Trend last 7 days */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={16} className="text-emerald-600" />
          <h2 className="font-semibold text-slate-900">Trend 7 hari terakhir</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Volume pencarian per hari.
        </p>
        {trendData.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            Belum ada data pencarian.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={trendData}
              margin={{ top: 5, right: 12, left: -20, bottom: 5 }}
            >
              <defs>
                <linearGradient id="searchTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "#cbd5e1" }}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
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
              <Area
                type="monotone"
                dataKey="count"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#searchTrend)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top queries chart */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 size={16} className="text-indigo-600" />
          <h2 className="font-semibold text-slate-900">Top 10 query</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Term yang paling sering dicari.
        </p>
        {topChartData.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            Belum ada data.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={topChartData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "#cbd5e1" }}
                allowDecimals={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "#cbd5e1" }}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                }}
                cursor={{ fill: "rgba(99,102,241,0.06)" }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top + no-result lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Top 30 pencarian</h2>
          </div>
          {data.topQueries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500 text-center">
              Belum ada data.
            </p>
          ) : (
            <>
              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Query</th>
                      <th className="px-4 py-2 text-center">Lang</th>
                      <th className="px-4 py-2 text-right">Count</th>
                      <th className="px-4 py-2 text-right">Avg hasil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topQueries.map((q, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-mono text-xs text-slate-900 break-all">
                          {q.query}
                        </td>
                        <td className="px-4 py-2 text-center text-xs text-slate-500">
                          {q.lang}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">
                          {q.count}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                          {q.avgResults.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile: compact rows */}
              <ul className="md:hidden divide-y divide-slate-100">
                {data.topQueries.map((q, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-900 truncate flex-1">
                      {q.query}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
                      {q.lang}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      ~{q.avgResults.toFixed(1)}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums font-semibold text-slate-900">
                      {q.count}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-rose-50/50">
            <div className="flex items-center gap-2">
              <SearchX size={14} className="text-rose-600" />
              <h2 className="font-semibold text-slate-900">No-result queries</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gap konten — pertimbangkan menambah konten untuk topik ini.
            </p>
          </div>
          {data.noResultQueries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500 text-center">
              ✨ Tidak ada query yang gagal.
            </p>
          ) : (
            <>
              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Query</th>
                      <th className="px-4 py-2 text-center">Lang</th>
                      <th className="px-4 py-2 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.noResultQueries.map((q, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-mono text-xs text-slate-900 break-all">
                          {q.query}
                        </td>
                        <td className="px-4 py-2 text-center text-xs text-slate-500">
                          {q.lang}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-rose-600">
                          {q.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile: compact rows */}
              <ul className="md:hidden divide-y divide-slate-100">
                {data.noResultQueries.map((q, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-900 truncate flex-1">
                      {q.query}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
                      {q.lang}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums font-semibold text-rose-600">
                      {q.count}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
