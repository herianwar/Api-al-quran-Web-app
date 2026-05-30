"use client";

import { BookOpen, Brain, ExternalLink, Star } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

interface ContentAna {
  topBookmarked: {
    ayatId: number;
    surahNomor: number;
    surahNama: string;
    nomorAyat: number;
    count: number;
    teks: string;
  }[];
  topMemorized: {
    ayatId: number;
    surahNomor: number;
    surahNama: string;
    nomorAyat: number;
    count: number;
    avgLevel: number;
  }[];
  popularSurahs: {
    nomor: number;
    namaLatin: string;
    bookmarks: number;
    hafalan: number;
    total: number;
  }[];
  hafalanLevels: { level: number; count: number }[];
}

const LEVEL_COLORS = [
  "#fca5a5",
  "#fdba74",
  "#fde047",
  "#86efac",
  "#67e8f9",
  "#a5b4fc",
];

export default function ContentAnalyticsPage() {
  const { data, error, isLoading, mutate } = useSWR<ContentAna>(
    "/admin/analytics/content",
    fetcher,
  );

  if (isLoading) return <Spinner label="Memuat content analytics…" />;
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return null;

  const surahChart = data.popularSurahs.slice(0, 10).map((s) => ({
    name: s.namaLatin,
    bookmarks: s.bookmarks,
    hafalan: s.hafalan,
  }));

  const levelChart = data.hafalanLevels.map((l) => ({
    name: `Level ${l.level}`,
    count: l.count,
    level: l.level,
  }));

  return (
    <>
      <PageHeader
        title="Content Analytics"
        description="Ayat dan surat paling populer berdasarkan bookmark + hafalan user."
        action={<RefreshButton onRefresh={() => mutate()} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Popular surahs */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-1">
            10 Surat Terpopuler
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Berdasarkan total bookmark + hafalan.
          </p>
          {surahChart.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Belum ada bookmark / hafalan.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={surahChart}
                layout="vertical"
                margin={{ top: 5, right: 12, left: 0, bottom: 5 }}
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
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  width={90}
                  // Truncate long surah names so wider names like
                  // "Al-Mu'minun" still fit without clipping the bars.
                  tickFormatter={(v: string) =>
                    v.length > 13 ? v.slice(0, 12) + "…" : v
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                  }}
                  cursor={{ fill: "rgba(99,102,241,0.06)" }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ paddingTop: 6, fontSize: 11 }}
                />
                <Bar
                  dataKey="bookmarks"
                  stackId="a"
                  fill="#f59e0b"
                  name="Bookmark"
                />
                <Bar
                  dataKey="hafalan"
                  stackId="a"
                  fill="#10b981"
                  name="Hafalan"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Hafalan level distribution */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-1">
            Distribusi Level Hafalan
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Berapa ayat di tiap level spaced-repetition (0=baru, 5=mantap).
          </p>
          {levelChart.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Belum ada hafalan.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={levelChart}
                margin={{ top: 5, right: 12, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
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
                  cursor={{ fill: "rgba(16,185,129,0.06)" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {levelChart.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={LEVEL_COLORS[entry.level] ?? "#94a3b8"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top bookmarked */}
      <section>
        <SectionHeader
          title="Top 20 Ayat Paling Banyak Di-bookmark"
          description="Ayat-ayat yang paling sering ditandai sebagai favorit user."
        />
        {data.topBookmarked.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Belum ada bookmark"
            description="Bookmark akan tampil di sini setelah user mulai memakai fitur."
          />
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left w-12">#</th>
                      <th className="px-4 py-2.5 text-left">Surat:Ayat</th>
                      <th className="px-4 py-2.5 text-left">Cuplikan</th>
                      <th className="px-4 py-2.5 text-right">Count</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topBookmarked.map((b, i) => (
                      <tr
                        key={b.ayatId}
                        className="border-t border-slate-100 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-1 rounded whitespace-nowrap">
                            {b.surahNama} {b.surahNomor}:{b.nomorAyat}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 max-w-md truncate">
                          {b.teks}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">
                          {b.count}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/surat/${b.surahNomor}#ayat-${b.nomorAyat}`}
                            target="_blank"
                            aria-label="Buka ayat"
                            className="inline-flex p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: cards */}
            <ul className="md:hidden space-y-2">
              {data.topBookmarked.map((b, i) => (
                <li key={b.ayatId} className="card p-3">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600 tabular-nums">
                      {i + 1}
                    </span>
                    <Link
                      href={`/surat/${b.surahNomor}#ayat-${b.nomorAyat}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded"
                    >
                      {b.surahNama} {b.surahNomor}:{b.nomorAyat}
                      <ExternalLink size={11} />
                    </Link>
                    <span className="ml-auto shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                      {b.count}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                    {b.teks}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Top memorized */}
      <section>
        <SectionHeader
          title="Top 20 Ayat Paling Banyak Dihafal"
          description="Ayat dengan jumlah user terbanyak yang menandai untuk dihafal."
        />
        {data.topMemorized.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="Belum ada hafalan"
            description="Daftar akan terisi otomatis saat user mulai menandai ayat untuk dihafal."
          />
        ) : (
          <>
            {/* Desktop: table */}
            <div className="hidden md:block card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left w-12">#</th>
                      <th className="px-4 py-2.5 text-left">Surat:Ayat</th>
                      <th className="px-4 py-2.5 text-right">Hafalan</th>
                      <th className="px-4 py-2.5 text-right">Avg Level</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topMemorized.map((h, i) => (
                      <tr
                        key={h.ayatId}
                        className="border-t border-slate-100 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-1 rounded whitespace-nowrap">
                            {h.surahNama} {h.surahNomor}:{h.nomorAyat}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">
                          {h.count}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                background:
                                  LEVEL_COLORS[Math.floor(h.avgLevel)] ??
                                  "#94a3b8",
                              }}
                            />
                            {h.avgLevel.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/surat/${h.surahNomor}#ayat-${h.nomorAyat}`}
                            target="_blank"
                            aria-label="Buka ayat"
                            className="inline-flex p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: cards */}
            <ul className="md:hidden space-y-2">
              {data.topMemorized.map((h, i) => (
                <li key={h.ayatId} className="card p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="shrink-0 grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600 tabular-nums">
                      {i + 1}
                    </span>
                    <Link
                      href={`/surat/${h.surahNomor}#ayat-${h.nomorAyat}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded"
                    >
                      {h.surahNama} {h.surahNomor}:{h.nomorAyat}
                      <ExternalLink size={11} />
                    </Link>
                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{
                          background:
                            LEVEL_COLORS[Math.floor(h.avgLevel)] ?? "#94a3b8",
                        }}
                      />
                      L{h.avgLevel.toFixed(1)}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                      {h.count}
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
