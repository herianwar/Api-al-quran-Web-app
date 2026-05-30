"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:hover:bg-emerald-600",
  secondary:
    "bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700 shadow-sm",
  danger:
    "bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 shadow-sm",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1",
  md: "px-4 py-2 text-sm gap-1.5",
};

/**
 * Single source-of-truth button untuk admin panel. Konsisten variant +
 * size + disabled state + loading text.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  loading,
  loadingText,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  loadingText?: string;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {icon && !loading && <span className="shrink-0">{icon}</span>}
      {loading && (
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent animate-spin" />
      )}
      <span>{loading ? loadingText ?? "Memproses…" : children}</span>
    </button>
  );
}
