"use client";

import { Coins, DollarSign, Gauge, MessageSquare, Zap } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";

interface CostPayload {
  rangeDays: number;
  totalCostUsd: number;
  totalQueries: number;
  cachedQueries: number;
  cacheHitRate: number;
  budgetUsd: number;
  budgetUsedPct: number;
  daily: {
    date: string;
    queries: number;
    cached: number;
    embedTokens: number;
    llmTokensIn: number;
    llmTokensOut: number;
    avgLatencyMs: number;
  }[];
  perModel: {
    model: string;
    kind: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  }[];
}

const RANGES = [
  { value: 7, label: "7 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
] as const;

function usd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}

function idr(usdAmount: number): string {
  // Quick ballpark — not authoritative. ~Rp 16k/USD avg 2026.
  const rp = usdAmount * 16_000;
  return `Rp ${rp.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

export default function AdminAiCostPage() {
  const [range, setRange] = useState<number>(30);
  const { data, error, isLoading } = useSWR<CostPayload>(
    `/admin/ai/cost?range=${range}`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  if (isLoading && !data) return <Spinner label="Memuat…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  const budgetExceeded = data.budgetUsd > 0 && data.totalCostUsd > data.budgetUsd;
  const budgetWarning =
    data.budgetUsd > 0 && data.budgetUsedPct >= 80 && !budgetExceeded;

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Cost Dashboard"
        description="Token usage & estimasi biaya OpenAI. Update auto setiap 30 detik."
        action={
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                  range === r.value
                    ? "bg-white shadow text-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {budgetExceeded && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 p-4">
          <p className="font-semibold">Budget bulanan terlampaui</p>
          <p className="text-sm mt-0.5">
            Spend ${data.totalCostUsd.toFixed(2)} / budget ${data.budgetUsd}. Pertimbangkan
            naikkan budget di /admin/settings/ai atau cache lebih agresif.
          </p>
        </div>
      )}
      {budgetWarning && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 p-4">
          <p className="font-semibold">
            Budget {data.budgetUsedPct}% terpakai
          </p>
          <p className="text-sm mt-0.5">
            Spend ${data.totalCostUsd.toFixed(2)} dari budget ${data.budgetUsd}. Sisa ~$
            {(data.budgetUsd - data.totalCostUsd).toFixed(2)}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={DollarSign}
          tone="emerald"
          label={`Total cost (${data.rangeDays}h)`}
          value={usd(data.totalCostUsd)}
          hint={idr(data.totalCostUsd)}
        />
        <StatCard
          icon={MessageSquare}
          tone="indigo"
          label="Queries"
          value={data.totalQueries.toLocaleString("id-ID")}
          hint={`${data.cachedQueries.toLocaleString("id-ID")} dari cache`}
        />
        <StatCard
          icon={Zap}
          tone="amber"
          label="Cache hit rate"
          value={`${data.cacheHitRate}%`}
          hint="Embedding di-cache di Redis 7d TTL"
        />
        <StatCard
          icon={Gauge}
          tone="rose"
          label={data.budgetUsd > 0 ? "Budget bulanan" : "Budget belum di-set"}
          value={data.budgetUsd > 0 ? usd(data.budgetUsd) : "—"}
          hint={
            data.budgetUsd > 0
              ? `${data.budgetUsedPct}% terpakai`
              : "Atur di /admin/settings/ai"
          }
        />
      </div>

      {/* Cost trend chart */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Token usage harian</h2>
        {data.daily.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">
            Belum ada query tercatat.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.daily.map((d) => ({
                  date: d.date,
                  total: d.embedTokens + d.llmTokensIn + d.llmTokensOut,
                  llm: d.llmTokensIn + d.llmTokensOut,
                  embed: d.embedTokens,
                }))}
                margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
              >
                <defs>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(v) =>
                    typeof v === "number"
                      ? v.toLocaleString("id-ID")
                      : String(v ?? "")
                  }
                />
                <Area
                  type="monotone"
                  dataKey="embed"
                  stroke="#10b981"
                  fill="url(#ge)"
                  strokeWidth={2}
                  name="Embedding"
                />
                <Area
                  type="monotone"
                  dataKey="llm"
                  stroke="#6366f1"
                  fill="url(#gl)"
                  strokeWidth={2}
                  name="LLM"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Per-model breakdown */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
          <Coins size={16} /> Per-model cost
        </h2>
        {data.perModel.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold pb-2">Model</th>
                  <th className="text-left font-semibold pb-2 px-2">Jenis</th>
                  <th className="text-right font-semibold pb-2 px-2">Token in</th>
                  <th className="text-right font-semibold pb-2 px-2">Token out</th>
                  <th className="text-right font-semibold pb-2 pl-2">Biaya</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.perModel.map((m, i) => (
                  <tr key={`${m.model}-${m.kind}-${i}`}>
                    <td className="py-2 font-mono text-xs">{m.model}</td>
                    <td className="px-2 text-xs uppercase">{m.kind}</td>
                    <td className="text-right tabular-nums px-2">
                      {m.tokensIn.toLocaleString("id-ID")}
                    </td>
                    <td className="text-right tabular-nums px-2">
                      {m.tokensOut.toLocaleString("id-ID")}
                    </td>
                    <td className="text-right tabular-nums pl-2 font-semibold">
                      {usd(m.costUsd)}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold border-t-2 border-slate-300">
                  <td colSpan={4} className="py-2 text-right">
                    Total
                  </td>
                  <td className="text-right tabular-nums pl-2">
                    {usd(data.totalCostUsd)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Estimasi biaya berdasarkan OpenAI rate card (text-embedding-3-small $0.02/1M
        token, GPT-4o-mini $0.15/1M in + $0.60/1M out). Konversi IDR pakai
        ~Rp 16.000/USD — untuk pricing akurat cek dashboard OpenAI.
      </p>
    </div>
  );
}
