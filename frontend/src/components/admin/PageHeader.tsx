"use client";

import type { ReactNode } from "react";

/**
 * Header standar untuk semua admin page. Format konsisten:
 *   <h1>Title</h1>
 *   <p>Description</p>
 *   [primary action button on the right]
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  /** ReactNode so callers can include badges/icons inline (e.g. env tag). */
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {description && (
          <div className="text-sm text-slate-500 mt-1.5 leading-relaxed max-w-2xl">
            {description}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Section header (h2) untuk membagi konten dalam page.
 */
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
