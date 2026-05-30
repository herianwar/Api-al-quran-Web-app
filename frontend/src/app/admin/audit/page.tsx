"use client";

import {
  Calendar,
  ChevronDown,
  Filter,
  ScrollText,
  Search,
  Smartphone,
  User,
  X,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import useSWR from "swr";
import { fetcherFull } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { DataTable, Pagination } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";

interface AuditEntry {
  id: number;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  target: string | null;
  metadata: Record<string, unknown> | null;
  clientHint: string | null;
  createdAt: string;
}

const ACTION_FILTERS = [
  { value: "", label: "Semua" },
  { value: "user", label: "User" },
  { value: "content", label: "Konten" },
  { value: "broadcast", label: "Broadcast" },
  { value: "cron", label: "Cron" },
  { value: "seed", label: "Seed" },
  { value: "snapshot", label: "Snapshot" },
];

const SINCE_FILTERS = [
  { value: "", label: "Semua" },
  { value: "1d", label: "24 jam" },
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
];

/**
 * Map an action's terminal verb to a tone so the table is scannable
 * (green=create/send, amber=update/trigger, rose=delete/demote, slate=other).
 */
function verbTone(action: string): {
  bg: string;
  text: string;
  ring: string;
} {
  const last = action.split(".").pop() ?? "";
  if (/^(create|promote|add|send|start|export|enable)/.test(last)) {
    return {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      ring: "ring-emerald-100",
    };
  }
  if (/^(update|edit|trigger|run|rotate|disable)/.test(last)) {
    return {
      bg: "bg-amber-50",
      text: "text-amber-700",
      ring: "ring-amber-100",
    };
  }
  if (/^(delete|demote|remove|cancel|revoke)/.test(last)) {
    return {
      bg: "bg-rose-50",
      text: "text-rose-700",
      ring: "ring-rose-100",
    };
  }
  return {
    bg: "bg-slate-100",
    text: "text-slate-700",
    ring: "ring-slate-200",
  };
}

function ActionBadge({ action }: { action: string }) {
  const [domain, ...rest] = action.split(".");
  const verb = rest.join(".");
  const tone = verbTone(action);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[10px] font-mono uppercase tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
        {domain}
      </span>
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
      >
        {verb || "—"}
      </span>
    </span>
  );
}

/** Map our short codes ("1d", "7d", "30d") to an ISO timestamp for ?since=. */
function sinceISO(value: string): string | undefined {
  if (!value) return undefined;
  const days = parseInt(value, 10);
  if (!Number.isFinite(days)) return undefined;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function fmtFullTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtShortTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailPanel({ entry }: { entry: AuditEntry }) {
  return (
    <div className="space-y-2.5 text-xs">
      <DetailRow label="Action">
        <code className="font-mono text-slate-700">{entry.action}</code>
      </DetailRow>
      <DetailRow label="Waktu">
        <span className="text-slate-700">{fmtFullTime(entry.createdAt)}</span>
      </DetailRow>
      {entry.actorEmail || entry.actorId ? (
        <DetailRow
          label={
            <span className="inline-flex items-center gap-1">
              <User size={11} /> Actor
            </span>
          }
        >
          <div className="text-slate-700">
            <span>{entry.actorEmail ?? "system"}</span>
            {entry.actorId && (
              <span className="ml-2 font-mono text-[10px] text-slate-400">
                {entry.actorId}
              </span>
            )}
          </div>
        </DetailRow>
      ) : null}
      {entry.target && (
        <DetailRow label="Target">
          <code className="font-mono text-slate-700 break-all">
            {entry.target}
          </code>
        </DetailRow>
      )}
      {entry.clientHint && (
        <DetailRow
          label={
            <span className="inline-flex items-center gap-1">
              <Smartphone size={11} /> Client
            </span>
          }
        >
          <span className="text-slate-700 break-all">{entry.clientHint}</span>
        </DetailRow>
      )}
      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
        <DetailRow label="Metadata" align="top">
          <pre className="rounded-md bg-slate-900 text-slate-100 text-[11px] font-mono p-3 overflow-x-auto leading-relaxed">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </DetailRow>
      )}
    </div>
  );
}

function DetailRow({
  label,
  children,
  align = "center",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  align?: "center" | "top";
}) {
  return (
    <div
      className={`grid grid-cols-[88px_1fr] gap-3 ${
        align === "top" ? "items-start" : "items-center"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [sinceFilter, setSinceFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  // Debounce search → reset to page 1 once typing stops.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const since = sinceISO(sinceFilter);
  const params = new URLSearchParams({
    page: String(page),
    limit: "30",
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...(since ? { since } : {}),
  });
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/admin/audit?${params.toString()}`,
    fetcherFull<AuditEntry[]>,
    { keepPreviousData: true },
  );

  const rows = data?.data ?? [];
  const total = data?.meta?.total;
  const filtering = !!actionFilter || !!debouncedQ || !!since;

  function toggleExpand(id: number) {
    setExpanded((cur) => (cur === id ? null : id));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        description={
          typeof total === "number"
            ? `${total.toLocaleString("id-ID")} entry${
                filtering ? " (filtered)" : ""
              }`
            : "Jejak semua aksi admin: promote, demote, delete user, edit konten, broadcast, dll."
        }
        action={<RefreshButton onRefresh={() => mutate()} />}
      />

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari email actor atau target (mis. user:foo@bar.com)…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            aria-label="Bersihkan pencarian"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters: action + date range */}
      <div className="card p-3 space-y-2">
        <FilterRow
          icon={<Filter size={13} />}
          label="Action"
          chips={ACTION_FILTERS}
          value={actionFilter}
          onChange={(v) => {
            setActionFilter(v);
            setPage(1);
          }}
        />
        <FilterRow
          icon={<Calendar size={13} />}
          label="Periode"
          chips={SINCE_FILTERS}
          value={sinceFilter}
          onChange={(v) => {
            setSinceFilter(v);
            setPage(1);
          }}
        />
      </div>

      {isLoading && !data && <Spinner label="Memuat audit log…" />}
      {error && <ErrorBox message={error.message} />}

      {data && rows.length === 0 && (
        <EmptyState
          icon={ScrollText}
          title="Belum ada audit log"
          description={
            filtering
              ? "Tidak ada entry cocok dengan filter ini."
              : "Audit log akan terisi otomatis saat admin melakukan aksi."
          }
        />
      )}

      {data && rows.length > 0 && (
        <div
          className={
            isValidating ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          {/* Desktop: table */}
          <div className="hidden md:block">
            <DataTable>
              <DataTable.Head>
                <tr>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Actor</th>
                  <th className="px-4 py-3 text-left">Target</th>
                  <th className="px-4 py-3 text-left">Waktu</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </DataTable.Head>
              <DataTable.Body>
                {rows.map((a) => {
                  const open = expanded === a.id;
                  return (
                    <Fragment key={a.id}>
                      <tr
                        onClick={() => toggleExpand(a.id)}
                        className="border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <ActionBadge action={a.action} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 break-all max-w-[200px]">
                          {a.actorEmail ?? (
                            <span className="text-slate-400">system</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600 break-all max-w-[260px]">
                          {a.target ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td
                          className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap"
                          title={fmtFullTime(a.createdAt)}
                        >
                          {fmtShortTime(a.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChevronDown
                            size={16}
                            className={`text-slate-400 transition-transform ${
                              open ? "rotate-180" : ""
                            }`}
                          />
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/70 border-t border-slate-100">
                          <td
                            colSpan={5}
                            className="px-5 py-4"
                          >
                            <DetailPanel entry={a} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </DataTable.Body>
            </DataTable>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-2">
            {rows.map((a) => {
              const open = expanded === a.id;
              return (
                <li key={a.id} className="card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpand(a.id)}
                    className="w-full text-left p-3 active:bg-slate-50"
                    aria-expanded={open}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <ActionBadge action={a.action} />
                        <p className="text-xs text-slate-600 mt-1.5 truncate">
                          {a.actorEmail ?? (
                            <span className="text-slate-400">system</span>
                          )}
                        </p>
                        {a.target && (
                          <p className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                            {a.target}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-slate-400 whitespace-nowrap">
                          {fmtShortTime(a.createdAt)}
                        </p>
                        <ChevronDown
                          size={14}
                          className={`text-slate-400 transition-transform ml-auto mt-1 ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100 bg-slate-50/60">
                      <DetailPanel entry={a} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <Pagination
            page={data.meta?.page ?? 1}
            totalPages={data.meta?.totalPages ?? 1}
            total={data.meta?.total}
            hasMore={!!data.meta?.hasMore}
            onPrev={() => {
              setExpanded(null);
              setPage((p) => Math.max(1, p - 1));
            }}
            onNext={() => {
              setExpanded(null);
              setPage((p) => p + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}

function FilterRow({
  icon,
  label,
  chips,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  chips: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <span className="inline-flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1.5">
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </span>
      <div className="flex gap-1 flex-nowrap">
        {chips.map((c) => (
          <button
            key={c.value || "all"}
            onClick={() => onChange(c.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              value === c.value
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
