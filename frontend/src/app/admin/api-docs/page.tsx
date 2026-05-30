"use client";

import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  Search,
  Shield,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { API_URL } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";

interface SchemaRef {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: SchemaRef;
  properties?: Record<string, SchemaRef & { description?: string }>;
  required?: string[];
  description?: string;
  nullable?: boolean;
}

interface Parameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: SchemaRef;
}

interface RequestBody {
  required?: boolean;
  content?: Record<string, { schema?: SchemaRef }>;
}

interface ResponseObj {
  description?: string;
  content?: Record<string, { schema?: SchemaRef }>;
}

interface Operation {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Array<Record<string, unknown>>;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, ResponseObj>;
}

interface OpenApiSpec {
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, Operation>>;
  tags?: { name: string; description?: string }[];
  components?: {
    schemas?: Record<string, SchemaRef>;
    securitySchemes?: Record<string, { type: string; in?: string; name?: string }>;
  };
  servers?: { url: string; description?: string }[];
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const METHOD_TONE: Record<
  HttpMethod,
  { chip: string; text: string }
> = {
  get: { chip: "bg-sky-100 text-sky-700", text: "text-sky-700" },
  post: { chip: "bg-emerald-100 text-emerald-700", text: "text-emerald-700" },
  put: { chip: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  patch: { chip: "bg-purple-100 text-purple-700", text: "text-purple-700" },
  delete: { chip: "bg-rose-100 text-rose-700", text: "text-rose-700" },
};

const fetchSpec = async (): Promise<OpenApiSpec> => {
  const origin = API_URL.replace(/\/api\/v\d+$/, "");
  const r = await fetch(`${origin}/api/docs-json`);
  if (!r.ok) throw new Error(`Gagal load OpenAPI spec: HTTP ${r.status}`);
  return r.json();
};

/** Resolve `#/components/schemas/Foo` ref to its inline schema (depth 1). */
function derefSchema(spec: OpenApiSpec, ref?: SchemaRef): SchemaRef | undefined {
  if (!ref) return undefined;
  if (!ref.$ref) return ref;
  const m = ref.$ref.match(/#\/components\/schemas\/(.+)$/);
  if (!m) return ref;
  const name = m[1];
  return spec.components?.schemas?.[name];
}

function schemaLabel(spec: OpenApiSpec, ref?: SchemaRef): string {
  if (!ref) return "—";
  if (ref.$ref) {
    const m = ref.$ref.match(/#\/components\/schemas\/(.+)$/);
    return m ? m[1] : ref.$ref;
  }
  if (ref.type === "array" && ref.items) {
    return `${schemaLabel(spec, ref.items)}[]`;
  }
  return ref.type ?? "object";
}

export default function AdminApiDocsPage() {
  const { data, error, isLoading, mutate } = useSWR<OpenApiSpec>(
    "openapi-spec",
    fetchSpec,
  );
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [methodFilter, setMethodFilter] = useState<HttpMethod | "">("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Debounce search input so we don't recompute the filter on every keystroke
  // (the spec can have hundreds of endpoints).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const swaggerUrl = useMemo(() => {
    const origin = API_URL.replace(/\/api\/v\d+$/, "");
    return `${origin}/api/docs`;
  }, []);
  const jsonUrl = useMemo(() => {
    const origin = API_URL.replace(/\/api\/v\d+$/, "");
    return `${origin}/api/docs-json`;
  }, []);

  const endpoints = useMemo(() => {
    if (!data) return [];
    const rows: {
      method: HttpMethod;
      path: string;
      op: Operation;
      summary: string;
      tags: string[];
      auths: string[];
    }[] = [];
    for (const [p, methods] of Object.entries(data.paths)) {
      for (const [m, op] of Object.entries(methods)) {
        if (!HTTP_METHODS.includes(m as HttpMethod)) continue;
        const auths = (op.security ?? [])
          .map((s) => Object.keys(s)[0])
          .filter(Boolean);
        rows.push({
          method: m as HttpMethod,
          path: p,
          op: op as Operation,
          summary: op.summary ?? "",
          tags: op.tags ?? [],
          auths,
        });
      }
    }
    return rows;
  }, [data]);

  const filtered = useMemo(() => {
    const q = debouncedQ.toLowerCase();
    return endpoints.filter((e) => {
      if (methodFilter && e.method !== methodFilter) return false;
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.tags.join(" ").toLowerCase().includes(q)
      );
    });
  }, [endpoints, debouncedQ, methodFilter, tagFilter]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    endpoints.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [endpoints]);

  const stats = useMemo(() => {
    const byMethod: Record<string, number> = {};
    endpoints.forEach((e) => {
      byMethod[e.method] = (byMethod[e.method] ?? 0) + 1;
    });
    return { total: endpoints.length, byMethod };
  }, [endpoints]);

  function copyToClipboard(text: string, key: string) {
    if (typeof navigator === "undefined") return;
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadSpec() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openapi-${data.info.version}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <Spinner label="Memuat OpenAPI spec…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  function toggleExpand(key: string) {
    setExpanded((cur) => (cur === key ? null : key));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="API Documentation"
        description={`${data.info.title} · v${data.info.version} · ${stats.total} endpoints`}
        action={
          <div className="flex flex-wrap gap-2">
            <RefreshButton onRefresh={() => mutate()} />
            <button
              onClick={downloadSpec}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Download spec</span>
            </button>
            <a
              href={swaggerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 shadow-sm"
            >
              <ExternalLink size={14} /> Swagger UI
            </a>
          </div>
        }
      />

      {/* Quick stats — now includes PATCH so it isn't a hidden blind spot. */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
        <div className="card p-3 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            Total
          </p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {stats.total}
          </p>
        </div>
        {HTTP_METHODS.map((m) => (
          <div key={m} className="card p-3 text-center">
            <p
              className={`text-xs font-bold uppercase tracking-wider mb-1 ${METHOD_TONE[m].text}`}
            >
              {m}
            </p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {stats.byMethod[m] ?? 0}
            </p>
          </div>
        ))}
      </div>

      {/* Auth schemes — descriptions now reflect the composite guard work
          (api-keys/seed/snapshots accept JWT admin OR seed key). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AuthSchemeCard
          icon={<Shield size={16} />}
          label="JWT Bearer"
          value="Authorization: Bearer <accessToken>"
          desc="Dari /auth/login. Endpoint user, admin role, dan (sejak composite guard) juga seed/snapshot/api-keys."
          tone="emerald"
          onCopy={(v) => copyToClipboard(v, "bearer")}
          copied={copied === "bearer"}
        />
        <AuthSchemeCard
          icon={<KeyRound size={16} />}
          label="Seed Admin Key"
          value="x-seed-admin-key: <SEED_ADMIN_KEY>"
          desc="Header opsional dari .env — disediakan untuk skrip/CI. Browser admin tinggal pakai JWT."
          tone="amber"
          onCopy={(v) => copyToClipboard(v, "admin")}
          copied={copied === "admin"}
        />
        <AuthSchemeCard
          icon={<Globe size={16} />}
          label="App API Key"
          value="X-API-Key: qsk_..."
          desc="Generate di /admin/api-keys. Untuk identify Android/iOS app, bukan menggantikan JWT user."
          tone="sky"
          onCopy={(v) => copyToClipboard(v, "api")}
          copied={copied === "api"}
        />
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari path, summary, atau tag…"
            className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-10 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={!methodFilter} onClick={() => setMethodFilter("")}>
            All
          </FilterChip>
          {HTTP_METHODS.map((m) => (
            <FilterChip
              key={m}
              active={methodFilter === m}
              onClick={() => setMethodFilter(m)}
            >
              {m.toUpperCase()}
            </FilterChip>
          ))}
          <span className="border-l border-slate-200 mx-1" />
          <FilterChip active={!tagFilter} onClick={() => setTagFilter("")}>
            All tags
          </FilterChip>
          {allTags.map((t) => (
            <FilterChip
              key={t}
              active={tagFilter === t}
              onClick={() => setTagFilter(t)}
            >
              {t}
            </FilterChip>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {filtered.length} endpoint{filtered.length === 1 ? "" : "s"} cocok
        </p>
      </div>

      {filtered.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Tidak ada endpoint cocok dengan filter ini.
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* Desktop: table with expand-row */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left w-24">Method</th>
                    <th className="px-4 py-3 text-left">Path</th>
                    <th className="px-4 py-3 text-left">Summary</th>
                    <th className="px-4 py-3 text-left">Auth</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const key = `${e.method} ${e.path}`;
                    const open = expanded === key;
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => toggleExpand(key)}
                          className="border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                        >
                          <td className="px-4 py-2.5">
                            <MethodChip method={e.method} />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-900">
                            <div
                              className="flex items-center gap-1.5"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              <span className="break-all">{e.path}</span>
                              <button
                                onClick={() =>
                                  copyToClipboard(e.path, `${e.method} ${e.path}`)
                                }
                                aria-label="Copy path"
                                className="text-slate-400 hover:text-slate-600 shrink-0"
                              >
                                {copied === `${e.method} ${e.path}` ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">
                            {e.summary || (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <AuthChips auths={e.auths} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <ChevronDown
                              size={14}
                              className={`text-slate-400 transition-transform ${
                                open ? "rotate-180" : ""
                              }`}
                            />
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-slate-50/70 border-t border-slate-100">
                            <td colSpan={5} className="px-5 py-4">
                              <OperationDetail
                                spec={data}
                                method={e.method}
                                path={e.path}
                                op={e.op}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-2">
            {filtered.map((e) => {
              const key = `${e.method} ${e.path}`;
              const open = expanded === key;
              return (
                <li key={key} className="card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpand(key)}
                    className="w-full text-left p-3 active:bg-slate-50"
                    aria-expanded={open}
                  >
                    <div className="flex items-start gap-2">
                      <MethodChip method={e.method} />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-slate-900 break-all">
                          {e.path}
                        </p>
                        {e.summary && (
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {e.summary}
                          </p>
                        )}
                        <div className="mt-1.5">
                          <AuthChips auths={e.auths} />
                        </div>
                      </div>
                      <ChevronDown
                        size={14}
                        className={`text-slate-400 transition-transform shrink-0 mt-1 ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100 bg-slate-50/60">
                      <OperationDetail
                        spec={data}
                        method={e.method}
                        path={e.path}
                        op={e.op}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-sky-50 border border-emerald-100 p-5 text-sm text-slate-700">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen size={16} className="text-emerald-700" />
          <span className="font-semibold text-slate-900">Tips integrasi</span>
        </div>
        <ul className="space-y-1.5 text-xs leading-relaxed list-disc list-inside">
          <li>
            <strong>Mobile first sync:</strong> hit{" "}
            <code className="bg-white px-1 rounded">GET /quran/dump</code>{" "}
            sekali → cache offline.
          </li>
          <li>
            <strong>Delta sync:</strong> simpan{" "}
            <code className="bg-white px-1 rounded">lastSyncAt</code> di client,
            panggil ulang dengan{" "}
            <code className="bg-white px-1 rounded">?since=&lt;ISO8601&gt;</code>.
          </li>
          <li>
            <strong>ETag:</strong> simpan ETag tiap endpoint, kirim{" "}
            <code className="bg-white px-1 rounded">If-None-Match</code> di
            request berikutnya — server balas 304 jika belum berubah.
          </li>
          <li>
            <strong>Audio streaming:</strong> jangan langsung hit equran CDN.
            Pakai{" "}
            <code className="bg-white px-1 rounded">
              /audio/stream/:qari/...
            </code>{" "}
            agar audio cached lokal.
          </li>
          <li>
            <strong>Try It Out:</strong> Swagger UI sekarang punya dropdown
            server (Production + Local dev) — pilih yang sesuai sebelum
            execute.
          </li>
        </ul>
      </div>
    </div>
  );
}

function MethodChip({ method }: { method: HttpMethod }) {
  const tone = METHOD_TONE[method];
  return (
    <span
      className={`inline-block w-14 text-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${tone.chip}`}
    >
      {method}
    </span>
  );
}

function AuthChips({ auths }: { auths: string[] }) {
  if (auths.length === 0) {
    return (
      <span className="text-xs text-emerald-600 font-medium">public</span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {auths.map((a) => (
        <span
          key={a}
          className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
        >
          {a}
        </span>
      ))}
    </div>
  );
}

function OperationDetail({
  spec,
  method,
  path,
  op,
}: {
  spec: OpenApiSpec;
  method: HttpMethod;
  path: string;
  op: Operation;
}) {
  const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
  const bodyResolved = derefSchema(spec, bodySchema);
  const bodyLabel = schemaLabel(spec, bodySchema);

  return (
    <div className="space-y-3 text-xs">
      {op.description && (
        <DetailSection label="Description">
          <p className="text-slate-700 whitespace-pre-line leading-relaxed">
            {op.description}
          </p>
        </DetailSection>
      )}

      <DetailSection label="Endpoint">
        <code className="font-mono text-slate-900 break-all">
          <span className={`font-bold ${METHOD_TONE[method].text} uppercase mr-2`}>
            {method}
          </span>
          {path}
        </code>
      </DetailSection>

      {op.parameters && op.parameters.length > 0 && (
        <DetailSection label="Parameters">
          <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-100 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left w-16">In</th>
                  <th className="px-2 py-1 text-left w-20">Type</th>
                  <th className="px-2 py-1 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                {op.parameters.map((p) => (
                  <tr
                    key={`${p.in}-${p.name}`}
                    className="border-t border-slate-100"
                  >
                    <td className="px-2 py-1 font-mono text-slate-900 break-all">
                      {p.name}
                      {p.required && (
                        <span className="text-rose-500"> *</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 uppercase">
                        {p.in}
                      </span>
                    </td>
                    <td className="px-2 py-1 font-mono text-slate-700">
                      {schemaLabel(spec, p.schema)}
                    </td>
                    <td className="px-2 py-1 text-slate-600">
                      {p.description ?? (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DetailSection>
      )}

      {bodySchema && (
        <DetailSection label="Request body">
          <p className="text-slate-600 mb-1.5">
            Schema:{" "}
            <code className="font-mono text-slate-900 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
              {bodyLabel}
            </code>
            {op.requestBody?.required && (
              <span className="text-rose-500 ml-1">required</span>
            )}
          </p>
          {bodyResolved?.properties && (
            <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-2 py-1 text-left">Field</th>
                    <th className="px-2 py-1 text-left w-20">Type</th>
                    <th className="px-2 py-1 text-left">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(bodyResolved.properties).map(([name, sch]) => {
                    const required =
                      bodyResolved.required?.includes(name) ?? false;
                    return (
                      <tr key={name} className="border-t border-slate-100">
                        <td className="px-2 py-1 font-mono text-slate-900 break-all">
                          {name}
                          {required && (
                            <span className="text-rose-500"> *</span>
                          )}
                        </td>
                        <td className="px-2 py-1 font-mono text-slate-700">
                          {schemaLabel(spec, sch)}
                        </td>
                        <td className="px-2 py-1 text-slate-600">
                          {sch.description ?? (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DetailSection>
      )}

      {op.responses && Object.keys(op.responses).length > 0 && (
        <DetailSection label="Responses">
          <ul className="space-y-1">
            {Object.entries(op.responses).map(([code, resp]) => {
              const respSchema =
                resp.content?.["application/json"]?.schema;
              const respLabel = respSchema
                ? schemaLabel(spec, respSchema)
                : null;
              const tone =
                code.startsWith("2")
                  ? "bg-emerald-100 text-emerald-700"
                  : code.startsWith("4")
                    ? "bg-amber-100 text-amber-700"
                    : code.startsWith("5")
                      ? "bg-rose-100 text-rose-700"
                      : "bg-slate-100 text-slate-700";
              return (
                <li
                  key={code}
                  className="flex items-start gap-2 rounded-md bg-white border border-slate-200 px-2 py-1.5"
                >
                  <span
                    className={`shrink-0 inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${tone}`}
                  >
                    {code}
                  </span>
                  <span className="text-slate-700 leading-relaxed flex-1">
                    {resp.description ?? "—"}
                  </span>
                  {respLabel && (
                    <code className="shrink-0 font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {respLabel}
                    </code>
                  )}
                </li>
              );
            })}
          </ul>
        </DetailSection>
      )}

      {op.tags && op.tags.length > 0 && (
        <DetailSection label="Tags">
          <div className="flex flex-wrap gap-1">
            {op.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded"
              >
                {t}
              </span>
            ))}
          </div>
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "text-slate-600 bg-slate-100 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function AuthSchemeCard({
  icon,
  label,
  value,
  desc,
  tone,
  onCopy,
  copied,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  desc: string;
  tone: "emerald" | "amber" | "sky";
  onCopy: (v: string) => void;
  copied: boolean;
}) {
  const t = {
    emerald: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      ring: "ring-emerald-100",
    },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      ring: "ring-amber-100",
    },
    sky: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-100" },
  }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${t.bg} ${t.text} ring-1 ${t.ring}`}
        >
          {icon}
        </span>
        <h3 className="font-semibold text-slate-900">{label}</h3>
      </div>
      <p className="text-xs text-slate-500 mb-2 leading-relaxed">{desc}</p>
      <div className="flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 font-mono text-[11px] overflow-hidden">
        <span className="text-slate-700 truncate flex-1 select-all">
          {value}
        </span>
        <button
          onClick={() => onCopy(value)}
          aria-label="Copy"
          className="shrink-0 text-slate-500 hover:text-slate-700"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}
