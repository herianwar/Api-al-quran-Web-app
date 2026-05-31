"use client";

import { Shield, UserPlus, Users } from "lucide-react";
import Link from "next/link";
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

interface UsersAna {
  signupsLast30: { day: string; count: number }[];
  roles: { role: string; count: number }[];
  activeWithDevice: number;
  dau: number;
  wau: number;
  mau: number;
  latestSignups: {
    id: string;
    email: string;
    nama: string | null;
    role: string;
    createdAt: string;
    _count: { bookmarks: number; hafalan: number; deviceTokens: number };
  }[];
}

const ROLE_COLORS: Record<string, string> = {
  admin: "#f59e0b",
  user: "#10b981",
};

export default function UsersAnalyticsPage() {
  const { data, error, isLoading, mutate } = useSWR<UsersAna>(
    "/admin/analytics/users",
    fetcher,
  );

  if (isLoading) return <Spinner label="Memuat user analytics…" />;
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return null;

  const total = data.roles.reduce((s, r) => s + r.count, 0);
  const signupsTotal = data.signupsLast30.reduce((s, d) => s + d.count, 0);
  const trend = data.signupsLast30.map((d) => ({
    label: new Date(d.day).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    }),
    count: d.count,
  }));

  return (
    <>
      <PageHeader
        title="Users Analytics"
        description="Trend pendaftaran, role distribution, dan retention pengguna."
        action={<RefreshButton onRefresh={() => mutate()} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total user" value={total} icon={Users} tone="emerald" />
        <StatCard
          label="Signup 30 hari"
          value={signupsTotal}
          icon={UserPlus}
          tone="indigo"
        />
        <StatCard
          label="Admin"
          value={data.roles.find((r) => r.role === "admin")?.count ?? 0}
          icon={Shield}
          tone="amber"
        />
        <StatCard
          label="Aktif (push)"
          value={data.activeWithDevice}
          icon={Users}
          tone="sky"
          hint="ada device terdaftar"
        />
      </div>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          User aktif (baca / bookmark / hafalan / catatan)
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="DAU"
            value={data.dau}
            icon={Users}
            tone="emerald"
            hint="aktif hari ini"
          />
          <StatCard
            label="WAU"
            value={data.wau}
            icon={Users}
            tone="indigo"
            hint="7 hari terakhir"
          />
          <StatCard
            label="MAU"
            value={data.mau}
            icon={Users}
            tone="sky"
            hint="30 hari terakhir"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Signups 30 hari</h2>
          <p className="text-xs text-slate-500 mb-4">
            Jumlah user baru per hari.
          </p>
          {trend.length === 0 ? (
            <p className="text-sm text-slate-500 py-12 text-center">
              Belum ada signup di 30 hari terakhir.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={trend}
                margin={{ top: 5, right: 12, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="signupsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
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
                  strokeWidth={2.5}
                  fill="url(#signupsGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Role</h2>
          <p className="text-xs text-slate-500 mb-4">Distribusi user vs admin.</p>
          {data.roles.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Belum ada user.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.roles}
                  dataKey="count"
                  nameKey="role"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  label={(e: { payload?: { role?: string; count?: number } }) =>
                    `${e.payload?.role ?? ""}: ${e.payload?.count ?? 0}`
                  }
                  labelLine={false}
                >
                  {data.roles.map((r) => (
                    <Cell
                      key={r.role}
                      fill={ROLE_COLORS[r.role] ?? "#94a3b8"}
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

      {/* Latest signups */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">10 user terbaru</h2>
          <p className="text-xs text-slate-500">Daftar pendaftar paling akhir.</p>
        </div>

        {data.latestSignups.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Belum ada user.
          </p>
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Email</th>
                    <th className="px-4 py-2.5 text-left">Nama</th>
                    <th className="px-4 py-2.5 text-left">Role</th>
                    <th className="px-4 py-2.5 text-right" title="Bookmarks">BM</th>
                    <th className="px-4 py-2.5 text-right" title="Hafalan">Hfl</th>
                    <th className="px-4 py-2.5 text-right" title="Devices">Dev</th>
                    <th className="px-4 py-2.5 text-left">Bergabung</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latestSignups.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t border-slate-100 hover:bg-slate-50/50"
                    >
                      <td className="px-4 py-2.5 font-medium">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="text-emerald-700 hover:text-emerald-800 hover:underline break-all"
                        >
                          {u.email}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {u.nama ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            u.role === "admin"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {u._count.bookmarks}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {u._count.hafalan}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {u._count.deviceTokens}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <ul className="md:hidden divide-y divide-slate-100">
              {data.latestSignups.map((u) => (
                <li key={u.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-bold">
                      {(u.nama ?? u.email)[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="block font-semibold text-emerald-700 hover:underline break-all leading-tight"
                      >
                        {u.email}
                      </Link>
                      <p className="text-sm text-slate-600 truncate">
                        {u.nama ?? "—"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                        u.role === "admin"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                    <span title="Bookmarks">BM {u._count.bookmarks}</span>
                    <span title="Hafalan">Hfl {u._count.hafalan}</span>
                    <span title="Devices">Dev {u._count.deviceTokens}</span>
                    <span className="ml-auto">
                      {new Date(u.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
