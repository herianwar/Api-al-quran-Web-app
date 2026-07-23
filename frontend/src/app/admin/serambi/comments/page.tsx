"use client";

import {
  ArrowLeft,
  Eye,
  EyeOff,
  MessageCircle,
  MessageSquareQuote,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import { apiFetch, fetcher, fetcherFull } from "@/lib/api";
import type { SerambiAdminStats, SerambiComment } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";
import { ConfirmDialog, type ConfirmOptions } from "@/components/admin/ConfirmDialog";
import { DataTable, Pagination } from "@/components/admin/DataTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { RefreshButton } from "@/components/admin/RefreshButton";

const STATUS: Record<string, { label: string; badge: string }> = {
  visible: { label: "Tampil", badge: "bg-emerald-100 text-emerald-700" },
  hidden: { label: "Disembunyikan", badge: "bg-slate-200 text-slate-600" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.visible;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  if (hr < 24) return `${hr} jam lalu`;
  if (day < 30) return `${day} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID");
}

function num(n?: number | null): string {
  return (n ?? 0).toLocaleString("id-ID");
}

function excerpt(body: string, max = 70): string {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max).trimEnd()}…` : one;
}

const LIMIT = 20;

export default function AdminSerambiCommentsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CommentsInner />
    </Suspense>
  );
}

function CommentsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Filter hidup di URL — "Komentar post ini" dari daftar post masuk ke sini.
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const postId = sp.get("postId") ?? "";
  const page = Number(sp.get("page")) || 1;

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  const [qInput, setQInput] = useState(q);
  const [qSynced, setQSynced] = useState(q);
  const searchRef = useRef<HTMLInputElement | null>(null);
  if (qSynced !== q) {
    setQSynced(q);
    setQInput(q);
  }
  useEffect(() => {
    const trimmed = qInput.trim();
    if (trimmed === q) return;
    const t = setTimeout(() => {
      setParams({ q: trimmed.length >= 2 ? trimmed : null });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, q, setParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const listKey = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (postId) p.set("postId", postId);
    return `/admin/serambi/comments?${p.toString()}`;
  }, [page, q, status, postId]);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    listKey,
    fetcherFull<SerambiComment[]>,
    { keepPreviousData: true },
  );
  const { data: stats, mutate: mutateStats } = useSWR<SerambiAdminStats>(
    "/admin/serambi/stats",
    fetcher,
  );

  const rows = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total;
  const filtering = !!q || !!status || !!postId;

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "err" } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<
    (ConfirmOptions & { onConfirm: () => void }) | null
  >(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = (msg: string, tone: "ok" | "err" = "ok") =>
    setToast({ msg, tone });

  const refresh = useCallback(
    () => Promise.all([mutate(), mutateStats()]),
    [mutate, mutateStats],
  );

  // Isi post yang sedang difilter (dibawa dari baris komentar mana pun).
  const filteredPostBody = rows.find((c) => c.post?.id === postId)?.post?.body;

  async function toggleHide(c: SerambiComment) {
    const next = c.status === "visible" ? "hidden" : "visible";
    setBusy(true);
    try {
      await apiFetch(`/admin/serambi/comments/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await refresh();
      notify(next === "hidden" ? "Komentar disembunyikan." : "Komentar ditampilkan.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Gagal mengubah status", "err");
    } finally {
      setBusy(false);
    }
  }

  function askRemove(c: SerambiComment) {
    setConfirm({
      title: "Hapus komentar ini?",
      message: `"${excerpt(c.body, 90)}" akan dihapus permanen dan jumlah komentar pada post ikut berkurang.`,
      confirmLabel: "Hapus permanen",
      tone: "danger",
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        try {
          await apiFetch(`/admin/serambi/comments/${c.id}`, { method: "DELETE" });
          await refresh();
          notify("Komentar dihapus.");
        } catch (e) {
          notify(e instanceof Error ? e.message : "Gagal menghapus", "err");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  const description =
    typeof total === "number"
      ? filtering
        ? `${num(total)} hasil cocok`
        : `${num(total)} komentar · ${num(stats?.comments.hidden)} disembunyikan`
      : "Moderasi komentar pengguna di feed Serambi.";

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Moderasi Komentar Serambi"
        description={description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onRefresh={refresh} />
            <Link
              href="/admin/serambi"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
            >
              <ArrowLeft size={15} />
              Kembali ke post
            </Link>
          </div>
        }
      />

      {/* Banner filter per-post */}
      {postId && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <MessageSquareQuote size={16} className="shrink-0" />
          <span className="font-semibold">Komentar untuk satu post:</span>
          <span className="min-w-0 truncate">
            {filteredPostBody ? excerpt(filteredPostBody, 70) : postId}
          </span>
          <button
            onClick={() => setParams({ postId: null })}
            className="ml-auto text-xs font-semibold text-emerald-700 hover:underline"
          >
            Tampilkan semua komentar
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          ref={searchRef}
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Cari isi komentar…  (tekan / )"
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
        />
        {qInput && (
          <button
            type="button"
            onClick={() => setQInput("")}
            aria-label="Bersihkan pencarian"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter status */}
      <div className="flex flex-wrap gap-2">
        <FilterPill
          active={!status}
          onClick={() => setParams({ status: null })}
          count={stats?.comments.total}
        >
          Semua
        </FilterPill>
        <FilterPill
          active={status === "visible"}
          onClick={() => setParams({ status: "visible" })}
          count={
            stats ? stats.comments.total - stats.comments.hidden : undefined
          }
          tone="emerald"
        >
          Tampil
        </FilterPill>
        <FilterPill
          active={status === "hidden"}
          onClick={() => setParams({ status: "hidden" })}
          count={stats?.comments.hidden}
          tone="slate"
        >
          Disembunyikan
        </FilterPill>
      </div>

      {error && <ErrorBox message={(error as Error).message} />}

      {isLoading && !data ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title={filtering ? "Tidak ada komentar cocok" : "Belum ada komentar"}
          description={
            filtering
              ? "Coba ubah kata kunci atau bersihkan filter yang aktif."
              : "Belum ada komentar dari pengguna."
          }
          action={
            filtering ? (
              <button
                onClick={() => setParams({ q: null, status: null, postId: null })}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Bersihkan filter
              </button>
            ) : undefined
          }
        />
      ) : (
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
                  <th className="px-4 py-3 text-left">Komentar</th>
                  <th className="px-4 py-3 text-left">Penulis</th>
                  <th className="px-4 py-3 text-left">Post</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Waktu</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </DataTable.Head>
              <DataTable.Body>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <td className="px-4 py-3 max-w-md">
                      {/* Plain text — never dangerouslySetInnerHTML (XSS). */}
                      <span
                        className={`line-clamp-2 text-sm ${
                          c.status === "hidden"
                            ? "text-slate-400 line-through"
                            : "text-slate-800"
                        }`}
                      >
                        {c.body}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[10rem]">
                      {c.user ? (
                        <Link
                          href={`/admin/users/${c.user.id}`}
                          className="block truncate text-emerald-700 hover:underline"
                        >
                          {c.user.nama ?? c.user.email}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[12rem]">
                      {c.post ? (
                        <button
                          onClick={() => setParams({ postId: c.post!.id })}
                          className="line-clamp-1 text-left hover:text-emerald-700"
                          title="Lihat semua komentar post ini"
                        >
                          {c.post.body}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      <span title={new Date(c.createdAt).toLocaleString("id-ID")}>
                        {relativeTime(c.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title={
                            c.status === "visible" ? "Sembunyikan" : "Tampilkan"
                          }
                          disabled={busy}
                          onClick={() => void toggleHide(c)}
                        >
                          {c.status === "visible" ? (
                            <EyeOff size={15} />
                          ) : (
                            <Eye size={15} />
                          )}
                        </IconBtn>
                        <IconBtn
                          title="Hapus"
                          danger
                          disabled={busy}
                          onClick={() => askRemove(c)}
                        >
                          <Trash2 size={15} />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable.Body>
            </DataTable>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3">
            {rows.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-sm ${
                      c.status === "hidden"
                        ? "text-slate-400 line-through"
                        : "text-slate-800"
                    }`}
                  >
                    {c.body}
                  </p>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <span className="truncate">
                    {c.user?.nama ?? c.user?.email ?? "—"}
                  </span>
                  <span className="ml-auto">{relativeTime(c.createdAt)}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleHide(c)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
                  >
                    {c.status === "visible" ? (
                      <>
                        <EyeOff size={13} /> Sembunyikan
                      </>
                    ) : (
                      <>
                        <Eye size={13} /> Tampilkan
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => askRemove(c)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 size={13} /> Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <Pagination
            page={data?.meta?.page ?? 1}
            totalPages={data?.meta?.totalPages ?? 1}
            total={data?.meta?.total}
            hasMore={!!data?.meta?.hasMore}
            onPrev={() => setParams({ page: String(Math.max(1, page - 1)) })}
            onNext={() => setParams({ page: String(page + 1) })}
          />
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.tone === "ok" ? "bg-slate-900 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function FilterPill({
  children,
  active,
  onClick,
  count,
  tone = "emerald",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
  tone?: "emerald" | "slate";
}) {
  const activeCls: Record<string, string> = {
    emerald: "border-emerald-500 bg-emerald-50 text-emerald-700",
    slate: "border-slate-400 bg-slate-100 text-slate-700",
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-sm transition ${
        active
          ? activeCls[tone]
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
      {typeof count === "number" && (
        <span className="tabular-nums opacity-70">{num(count)}</span>
      )}
    </button>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40 ${
        danger
          ? "text-rose-500 hover:bg-rose-50 hover:border-rose-300"
          : "text-slate-500 hover:bg-slate-50 hover:border-emerald-400 hover:text-emerald-600"
      }`}
    >
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="card divide-y divide-slate-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <div className="flex-1 space-y-2">
            <Skeleton width="65%" height={14} />
            <Skeleton width="30%" height={11} />
          </div>
          <Skeleton width={32} height={32} rounded="lg" />
          <Skeleton width={32} height={32} rounded="lg" />
        </div>
      ))}
    </div>
  );
}
