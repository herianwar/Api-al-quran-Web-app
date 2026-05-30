"use client";

import { CircleAlert, MessageSquare, Search, Sparkles, TrendingDown } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { fetcherFull } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Pagination } from "@/components/admin/DataTable";
import { PageHeader } from "@/components/admin/PageHeader";

interface QueryRow {
  id: string;
  query: string;
  resultCount: number;
  topScore: number | null;
  embedTokens: number;
  llmTokensIn: number;
  llmTokensOut: number;
  cached: boolean;
  withSummary: boolean;
  latencyMs: number;
  createdAt: string;
}

interface QueriesPayload {
  items: QueryRow[];
  topQueries: { query: string; count: number; avgScore: number | null }[];
  gapQueries: { query: string; count: number }[];
}

export default function AdminAiQueriesPage() {
  const [onlyNoResults, setOnlyNoResults] = useState(false);
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({
    page: String(page),
    limit: "50",
    ...(onlyNoResults ? { onlyNoResults: "true" } : {}),
  });
  const { data, error, isLoading } = useSWR(
    `/admin/ai/queries?${params.toString()}`,
    fetcherFull<QueriesPayload>,
    { keepPreviousData: true },
  );

  if (isLoading && !data) return <Spinner label="Memuat…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  const total = data.meta?.total ?? 0;
  const rows = data.data.items;

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Queries Log"
        description="Riwayat semua pertanyaan natural-language ke /quran/ask. Filter no-match menampilkan query yang belum punya jawaban relevan — sumber inspirasi untuk seed konten baru."
      />

      {/* Top queries + gap content side-by-side */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <TrendingDown size={16} className="text-emerald-700 rotate-180" />
            Top queries (30 hari)
          </h2>
          {data.data.topQueries.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada data.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.data.topQueries.map((q) => (
                <li
                  key={q.query}
                  className="flex items-center justify-between text-sm gap-2"
                >
                  <span className="truncate">{q.query}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {q.avgScore !== null && (
                      <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 rounded">
                        {Math.round(q.avgScore * 100)}%
                      </span>
                    )}
                    <span className="font-semibold tabular-nums text-slate-700">
                      {q.count}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3 inline-flex items-center gap-2">
            <CircleAlert size={16} className="text-amber-600" />
            Gap content (no-match, 30 hari)
          </h2>
          <p className="text-xs text-slate-500 mb-2">
            Query yang topScore-nya &lt; 30% atau tanpa hasil. Pertimbangkan
            menambah topik/konten yang menjawab pertanyaan ini.
          </p>
          {data.data.gapQueries.length === 0 ? (
            <p className="text-sm text-slate-400">
              Tidak ada gap — semua query mendapat jawaban relevan.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.data.gapQueries.map((q) => (
                <li
                  key={q.query}
                  className="flex items-center justify-between text-sm gap-2"
                >
                  <span className="truncate">{q.query}</span>
                  <span className="font-semibold tabular-nums text-amber-700">
                    {q.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent queries table */}
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
            <MessageSquare size={16} />
            Riwayat query
            <span className="text-xs font-normal text-slate-400 tabular-nums">
              ({total.toLocaleString("id-ID")} total)
            </span>
          </h2>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={onlyNoResults}
              onChange={(e) => {
                setOnlyNoResults(e.target.checked);
                setPage(1);
              }}
              className="rounded"
            />
            Hanya no-match
          </label>
        </div>

        {rows.length === 0 ? (
          <p className="text-center text-slate-400 py-8 text-sm">
            Belum ada query tercatat.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold pb-2 pr-2">Query</th>
                  <th className="text-right font-semibold pb-2 px-2">Hasil</th>
                  <th className="text-right font-semibold pb-2 px-2">Score</th>
                  <th className="text-right font-semibold pb-2 px-2">Token</th>
                  <th className="text-right font-semibold pb-2 px-2">Latency</th>
                  <th className="text-right font-semibold pb-2 pl-2">Kapan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-2 min-w-0">
                      <div className="flex items-center gap-2">
                        {r.cached && (
                          <span
                            className="text-[10px] bg-sky-100 text-sky-700 px-1 rounded font-mono"
                            title="Embedding di-cache"
                          >
                            cache
                          </span>
                        )}
                        {r.withSummary && (
                          <Sparkles
                            size={11}
                            className="text-emerald-600 shrink-0"
                          />
                        )}
                        <span className="truncate max-w-[28ch]" title={r.query}>
                          {r.query}
                        </span>
                      </div>
                    </td>
                    <td className="text-right tabular-nums px-2">
                      {r.resultCount}
                    </td>
                    <td className="text-right tabular-nums px-2">
                      {r.topScore !== null ? (
                        <span
                          className={
                            r.topScore < 0.3 ? "text-amber-700" : "text-slate-700"
                          }
                        >
                          {Math.round(r.topScore * 100)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums px-2 text-xs text-slate-500">
                      {r.embedTokens + r.llmTokensIn + r.llmTokensOut}
                    </td>
                    <td className="text-right tabular-nums px-2 text-xs text-slate-500">
                      {r.latencyMs}ms
                    </td>
                    <td className="text-right pl-2 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 50 && (
          <div className="mt-4">
            <Pagination
              page={page}
              totalPages={Math.ceil(total / 50)}
              total={total}
              hasMore={page < Math.ceil(total / 50)}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
