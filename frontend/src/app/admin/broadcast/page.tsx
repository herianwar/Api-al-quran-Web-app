"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Send,
  Smartphone,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import useSWR from "swr";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader, SectionHeader } from "@/components/admin/PageHeader";

interface BroadcastResult {
  attempted: number;
  successful: number;
  failed: number;
  invalidTokensRemoved: number;
  broadcastId?: string;
}

interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  deeplink: string | null;
  status: string;
  attemptedCount: number;
  successCount: number;
  failedCount: number;
  invalidRemoved: number;
  scheduledAt: string | null;
  sentAt: string | null;
  errorMsg: string | null;
  createdAt: string;
}

interface Preview {
  pushEnabled: boolean;
  deviceCount: number;
}

const TITLE_MAX = 80;
const BODY_MAX = 240;

function counterClass(len: number, max: number) {
  if (len >= max) return "text-rose-600 font-semibold";
  if (len >= max * 0.9) return "text-amber-600";
  return "text-slate-400";
}

/** Derive a human status from the stored counters. */
function deliveryStatus(b: BroadcastRow) {
  if (b.attemptedCount === 0)
    return { label: "Tanpa device", cls: "bg-slate-100 text-slate-500" };
  if (b.successCount === 0)
    return { label: "Gagal", cls: "bg-rose-100 text-rose-700" };
  if (b.failedCount > 0)
    return { label: "Sebagian", cls: "bg-amber-100 text-amber-700" };
  return { label: "Terkirim", cls: "bg-emerald-100 text-emerald-700" };
}

export default function AdminBroadcastPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deeplink, setDeeplink] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Synchronous re-entry guard: ConfirmDialog fires onConfirm on both the
  // autofocused button click AND an Enter keydown, and `busy` (setState) is
  // async — without this a single Enter could send the broadcast twice.
  const sendingRef = useRef(false);

  const { data: history, mutate } = useSWR<BroadcastRow[]>(
    "/admin/broadcasts",
    fetcher,
  );
  const { data: preview, mutate: mutatePreview } = useSWR<Preview>(
    "/admin/cron/broadcast/preview",
    fetcher,
  );

  const pushKnownOff = preview ? !preview.pushEnabled : false;
  const deviceCount = preview?.deviceCount;
  const canSend = !busy && !pushKnownOff && !!title.trim() && !!body.trim();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!title.trim() || !body.trim()) {
      setError("Judul dan isi wajib diisi.");
      return;
    }
    setConfirmOpen(true);
  }

  async function doSend() {
    setConfirmOpen(false);
    if (sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await apiFetch<BroadcastResult>(
        "/admin/cron/broadcast",
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            deeplink: deeplink.trim() || undefined,
          }),
        },
      );
      setResult(data);
      setTitle("");
      setBody("");
      setDeeplink("");
      await Promise.all([mutate(), mutatePreview()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim broadcast");
    } finally {
      setBusy(false);
      sendingRef.current = false;
    }
  }

  // Chart data: success rate over last 20 broadcasts (chronological).
  const chartData = (history ?? [])
    .slice(0, 20)
    .reverse()
    .map((b, i) => ({
      idx: i + 1,
      success:
        b.attemptedCount > 0
          ? Math.round((b.successCount / b.attemptedCount) * 100)
          : 0,
      attempted: b.attemptedCount,
    }));

  const resultAllFailed =
    result != null && result.attempted > 0 && result.successful === 0;
  const resultNoDevice = result != null && result.attempted === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Broadcast Push"
        description="Kirim push notification ke semua device, lengkap dengan riwayat & delivery rate."
      />

      {/* FCM disabled warning */}
      {pushKnownOff && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Push notification nonaktif</p>
            <p className="mt-0.5 leading-relaxed text-amber-800">
              Kredensial FCM belum dikonfigurasi di server, jadi broadcast{" "}
              <strong>tidak akan terkirim</strong> ke device. Set{" "}
              <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">
                FCM_SERVICE_ACCOUNT_PATH
              </code>{" "}
              di <code className="font-mono text-xs">.env</code> lalu restart API
              untuk mengaktifkan.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* Form */}
        <form onSubmit={onSubmit} className="card p-5 space-y-4">
          {error && (
            <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Judul
              </label>
              <span className={`text-xs ${counterClass(title.length, TITLE_MAX)}`}>
                {title.length}/{TITLE_MAX}
              </span>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Contoh: Ayat Hari Ini"
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Isi
              </label>
              <span className={`text-xs ${counterClass(body.length, BODY_MAX)}`}>
                {body.length}/{BODY_MAX}
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={BODY_MAX}
              rows={4}
              placeholder="Isi notifikasi, maksimal 240 karakter."
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Deeplink{" "}
              <span className="font-normal text-slate-400">· opsional</span>
            </label>
            <input
              value={deeplink}
              onChange={(e) => setDeeplink(e.target.value)}
              placeholder="/surat/2"
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            <p className="text-xs text-slate-500 mt-1">
              Path in-app yang dibuka saat notifikasi ditap (mis. /surat/2).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="submit"
              icon={<Send size={16} />}
              loading={busy}
              loadingText="Mengirim…"
              disabled={!canSend}
            >
              Kirim broadcast
            </Button>
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
              <Smartphone size={14} />
              {deviceCount === undefined
                ? "menghitung device…"
                : `${deviceCount.toLocaleString("id-ID")} device terdaftar`}
            </span>
          </div>

          {result && (
            <div
              className={`rounded-xl border p-4 text-sm ${
                resultAllFailed || resultNoDevice
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-emerald-200 bg-emerald-50/60"
              }`}
            >
              <p
                className={`font-semibold mb-2 ${
                  resultAllFailed || resultNoDevice
                    ? "text-amber-900"
                    : "text-emerald-900"
                }`}
              >
                {resultNoDevice
                  ? "Tidak ada device terdaftar"
                  : resultAllFailed
                    ? "Broadcast tercatat, tapi semua gagal terkirim"
                    : "Broadcast terkirim"}
              </p>
              <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-slate-700">
                <div>Diupayakan: {result.attempted}</div>
                <div>Sukses: {result.successful}</div>
                <div>Gagal: {result.failed}</div>
                <div>Token invalid dibersihkan: {result.invalidTokensRemoved}</div>
              </div>
            </div>
          )}
        </form>

        {/* Delivery rate chart */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-1">
            Delivery rate
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            % berhasil dari 20 broadcast terakhir.
          </p>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Belum ada broadcast.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 12, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="idx"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                  }}
                  formatter={(v) => [`${v}%`, "Success"] as [string, string]}
                />
                <Line
                  type="monotone"
                  dataKey="success"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#10b981" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* History */}
      <section>
        <SectionHeader
          title="Riwayat Broadcast"
          action={
            history && history.length > 0 ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 tabular-nums">
                {history.length}
              </span>
            ) : undefined
          }
        />
        {!history || history.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Belum ada broadcast"
            description="Broadcast push yang Anda kirim akan tampil di sini dengan delivery rate-nya."
          />
        ) : (
          <div className="space-y-2">
            {history.map((b) => {
              const st = deliveryStatus(b);
              const pct =
                b.attemptedCount > 0
                  ? Math.round((b.successCount / b.attemptedCount) * 100)
                  : null;
              return (
                <div key={b.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 truncate">
                          {b.title}
                        </h3>
                        <span
                          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">
                        {b.body}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-slate-400 text-right">
                      {new Date(b.createdAt).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-x-3 gap-y-1 text-xs flex-wrap">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <CheckCircle2 size={12} /> {b.successCount}
                    </span>
                    {b.failedCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                        <XCircle size={12} /> {b.failedCount}
                      </span>
                    )}
                    <span className="text-slate-500">
                      {pct === null ? "tanpa device" : `${pct}% delivery`}
                    </span>
                    {b.invalidRemoved > 0 && (
                      <span className="text-slate-400">
                        · {b.invalidRemoved} token dibersihkan
                      </span>
                    )}
                    {b.deeplink && (
                      <span className="font-mono text-slate-500 truncate max-w-[40%]">
                        → {b.deeplink}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Kirim broadcast?"
        message={
          deviceCount === 0
            ? "Belum ada device terdaftar — broadcast akan tercatat tapi tidak terkirim ke siapa pun. Lanjutkan?"
            : `Push akan dikirim ke ${
                deviceCount?.toLocaleString("id-ID") ?? "semua"
              } device terdaftar. Lanjutkan?`
        }
        confirmLabel="Kirim sekarang"
        onConfirm={doSend}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
