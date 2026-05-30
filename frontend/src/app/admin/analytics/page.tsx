"use client";

import {
  Activity,
  ArrowRight,
  BookOpen,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import {
  Area,
  AreaChart,
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
import { fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
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
  };
  userActivity: { bookmark: number; hafalan: number; deviceTokens: number };
}

interface UsersAna {
  signupsLast30: { day: string; count: number }[];
  roles: { role: string; count: number }[];
  activeWithDevice: number;
}

interface EngagementAna {
  bookmarksTrend: { day: string; count: number }[];
  hafalanTrend: { day: string; count: number }[];
  platforms: { platform: string; count: number }[];
}

const PLATFORM_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899"];

export default function AnalyticsOverviewPage() {
  const statsSwr = useSWR<Stats>("/admin/stats", fetcher);
  const usersSwr = useSWR<UsersAna>("/admin/analytics/users", fetcher);
  const engSwr = useSWR<EngagementAna>(
    "/admin/analytics/engagement",
    fetcher,
  );
  const { data: stats } = statsSwr;
  const { data: users } = usersSwr;
  const { data: eng } = engSwr;

  // Show errors instead of an infinite spinner — previously a single failed
  // endpoint trapped the page forever on the loading state.
  const firstError = statsSwr.error ?? usersSwr.error ?? engSwr.error;
  if (firstError) return <ErrorBox message={(firstError as Error).message} />;
  if (!stats || !users || !eng) return <Spinner label="Memuat analitik…" />;

  // Combine bookmarks + hafalan trend untuk overview chart
  const combinedTrend = mergeTrends(
    eng.bookmarksTrend,
    eng.hafalanTrend,
    "bookmark",
    "hafalan",
  );

  const signupsTotal = users.signupsLast30.reduce(
    (sum, d) => sum + d.count,
    0,
  );

  return (
    <>
      <PageHeader
        title="Analytics Overview"
        description="Ringkasan kondisi sistem & aktivitas pengguna. Klik tab di atas untuk detail."
        action={
          <RefreshButton
            onRefresh={() =>
              Promise.all([statsSwr.mutate(), usersSwr.mutate(), engSwr.mutate()])
            }
          />
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total user"
          value={stats.users.total}
          icon={Users}
          tone="emerald"
          hint={`+${signupsTotal} dalam 30 hari`}
        />
        <StatCard
          label="Aktif (push)"
          value={users.activeWithDevice}
          icon={Activity}
          tone="indigo"
          hint="ada device terdaftar"
        />
        <StatCard
          label="Bookmark"
          value={stats.userActivity.bookmark}
          icon={BookOpen}
          tone="amber"
        />
        <StatCard
          label="Hafalan"
          value={stats.userActivity.hafalan}
          icon={TrendingUp}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Combined trend */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-semibold text-slate-900">Aktivitas 30 hari</h2>
              <p className="text-xs text-slate-500">
                Bookmark + hafalan dibuat per hari.
              </p>
            </div>
            <Link
              href="/admin/analytics/engagement"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Detail <ArrowRight size={12} />
            </Link>
          </div>
          {combinedTrend.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Belum ada aktivitas.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={combinedTrend}
                margin={{ top: 10, right: 12, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="bookmarkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hafalanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
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
                  fill="url(#bookmarkGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="hafalan"
                  name="Hafalan"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#hafalanGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Platform breakdown */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-semibold text-slate-900">Platform device</h2>
              <p className="text-xs text-slate-500">
                Dari device terdaftar untuk push.
              </p>
            </div>
            <Link
              href="/admin/analytics/engagement"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Detail <ArrowRight size={12} />
            </Link>
          </div>
          {eng.platforms.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Belum ada device terdaftar.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={eng.platforms}
                  dataKey="count"
                  nameKey="platform"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  label={(e: { payload?: { platform?: string; count?: number } }) =>
                    `${e.payload?.platform ?? ""}: ${e.payload?.count ?? 0}`
                  }
                  labelLine={false}
                >
                  {eng.platforms.map((_, i) => (
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
      </div>

      {/* Quick links to sub-pages */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <AnalyticsCard
          href="/admin/analytics/traffic"
          icon={TrendingUp}
          tone="sky"
          title="Traffic Web"
          desc="Page views, unique visitors, top pages, device & realtime"
        />
        <AnalyticsCard
          href="/admin/analytics/users"
          icon={Users}
          tone="emerald"
          title="Pengguna"
          desc="Signups, retention, role distribution"
        />
        <AnalyticsCard
          href="/admin/analytics/content"
          icon={BookOpen}
          tone="indigo"
          title="Konten Populer"
          desc="Ayat & surat paling banyak di-bookmark / dihafal"
        />
        <AnalyticsCard
          href="/admin/analytics/engagement"
          icon={Activity}
          tone="amber"
          title="Engagement"
          desc="Bookmark/hafalan trend + platform + broadcast"
        />
        <AnalyticsCard
          href="/admin/analytics/search"
          icon={Search}
          tone="rose"
          title="Search"
          desc="Top queries + no-result gaps"
        />
      </div>
    </>
  );
}

function AnalyticsCard({
  href,
  icon: Icon,
  tone,
  title,
  desc,
}: {
  href: string;
  icon: typeof Users;
  tone: "emerald" | "indigo" | "amber" | "rose" | "sky";
  title: string;
  desc: string;
}) {
  const colors = {
    emerald: "from-emerald-500 to-teal-600",
    indigo: "from-indigo-500 to-purple-600",
    amber: "from-amber-500 to-orange-600",
    rose: "from-rose-500 to-pink-600",
    sky: "from-sky-500 to-blue-600",
  };
  return (
    <Link
      href={href}
      className="card card-hover p-5 group flex flex-col h-full"
    >
      <span
        className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${colors[tone]} text-white shadow-sm mb-3`}
      >
        <Icon size={20} strokeWidth={2.25} />
      </span>
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 leading-relaxed mb-3 flex-1">
        {desc}
      </p>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 group-hover:gap-2 transition-all">
        Lihat detail <ArrowRight size={12} />
      </span>
    </Link>
  );
}

function mergeTrends<A extends string, B extends string>(
  a: { day: string; count: number }[],
  b: { day: string; count: number }[],
  aKey: A,
  bKey: B,
): ({ day: string; label: string } & Record<A | B, number>)[] {
  const days = new Set<string>([...a.map((r) => r.day), ...b.map((r) => r.day)]);
  const aMap = new Map(a.map((r) => [r.day, r.count]));
  const bMap = new Map(b.map((r) => [r.day, r.count]));
  return Array.from(days)
    .sort()
    .map((day) => ({
      day,
      label: new Date(day).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      }),
      [aKey]: aMap.get(day) ?? 0,
      [bKey]: bMap.get(day) ?? 0,
    })) as ({ day: string; label: string } & Record<A | B, number>)[];
}
