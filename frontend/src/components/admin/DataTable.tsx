"use client";

import type { ReactNode } from "react";

/**
 * Wrapper card untuk tabel. Auto horizontal scroll di mobile + style th/td
 * konsisten. Pakai dengan <DataTable.Header> & <DataTable.Body> tanpa raw
 * <table> tag, atau cukup sebagai bungkus saja kalau lebih flexible.
 */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

DataTable.Head = function Head({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
      {children}
    </thead>
  );
};

DataTable.Body = function Body({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
};

/**
 * Pagination controls — konsisten antar admin page yang punya paginated
 * list (users, audit, doa, dll).
 */
export function Pagination({
  page,
  totalPages,
  total,
  hasMore,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total?: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm mt-4">
      <span className="text-slate-600">
        Hal. <span className="font-semibold text-slate-900">{page}</span> /{" "}
        {totalPages}
        {typeof total === "number" && (
          <>
            {" "}
            · total{" "}
            <span className="font-semibold text-slate-900">
              {total.toLocaleString("id-ID")}
            </span>
          </>
        )}
      </span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={onPrev}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-30 disabled:hover:border-slate-200 disabled:hover:text-slate-700 transition"
        >
          ← Prev
        </button>
        <button
          disabled={!hasMore}
          onClick={onNext}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-30 disabled:hover:border-slate-200 disabled:hover:text-slate-700 transition"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
