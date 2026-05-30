"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Konsisten empty state placeholder. Pakai di setiap admin page yang punya
 * list kosong, biar visual rhythm-nya sama.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card p-10 text-center">
      <span className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 mb-4">
        <Icon size={26} strokeWidth={1.75} />
      </span>
      <p className="font-semibold text-slate-700 mb-1">{title}</p>
      {description && (
        <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
