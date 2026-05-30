"use client";

import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  /** Tailwind color name (e.g. "emerald", "amber", "indigo", "rose") */
  tone?: "emerald" | "amber" | "indigo" | "rose" | "sky" | "slate";
  trend?: number; // % change vs previous period, optional
}

const TONE: Record<NonNullable<Props["tone"]>, { bg: string; text: string; ring: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-100" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-100" },
  rose: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-100" },
  sky: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-100" },
  slate: { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "emerald",
  trend,
}: Props) {
  const t = TONE[tone];
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        {Icon && (
          <span
            className={`shrink-0 grid h-10 w-10 place-items-center rounded-xl ${t.bg} ${t.text} ring-1 ${t.ring}`}
          >
            <Icon size={18} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
        {typeof value === "number" ? value.toLocaleString("id-ID") : value}
      </p>
      <div className="flex items-baseline gap-2 mt-1">
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
        {typeof trend === "number" && (
          <span
            className={`text-xs font-semibold ${
              trend >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
