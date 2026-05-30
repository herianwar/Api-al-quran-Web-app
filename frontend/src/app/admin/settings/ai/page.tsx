"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { PageHeader } from "@/components/admin/PageHeader";

interface SettingRow {
  key: string;
  label: string;
  category: string;
  isSecret: boolean;
  isConfigured: boolean;
  preview: string;
}

interface Coverage {
  totalAyat: number;
  withEmbedding: number;
  percent: number;
  model: string | null;
  dim: number | null;
  lastUpdate: string | null;
}

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export default function AdminAiSettingsPage() {
  const { data: mainRows, error, isLoading, mutate } = useSWR<SettingRow[]>(
    "/admin/settings?category=ai",
    fetcher,
  );
  const { data: advancedRows } = useSWR<SettingRow[]>(
    "/admin/settings?category=ai-advanced",
    fetcher,
  );
  const { data: coverage, mutate: mutateCoverage } = useSWR<Coverage>(
    "/admin/ai/coverage",
    fetcher,
    { refreshInterval: 5_000 },
  );

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedDraft, setAdvancedDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const apiKeyRow = mainRows?.find((r) => r.key === "ai.openai_api_key");
  const isAiReady = apiKeyRow?.isConfigured ?? false;

  // Clear the "tersimpan" flash after a couple of seconds.
  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2_500);
    return () => clearTimeout(t);
  }, [savedFlash]);

  async function saveApiKey() {
    if (!apiKey || busy) return;
    setBusy(true);
    try {
      await apiFetch("/admin/settings/ai.openai_api_key", {
        method: "PUT",
        body: JSON.stringify({ value: apiKey }),
      });
      setApiKey("");
      setSavedFlash(true);
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  async function clearApiKey() {
    if (!confirm("Hapus API key tersimpan?")) return;
    setBusy(true);
    try {
      await apiFetch("/admin/settings/ai.openai_api_key", {
        method: "PUT",
        body: JSON.stringify({ value: "" }),
      });
      setApiKey("");
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setBusy(false);
    }
  }

  async function saveAdvanced() {
    if (Object.keys(advancedDraft).length === 0 || busy) return;
    setBusy(true);
    try {
      await apiFetch("/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ values: advancedDraft }),
      });
      setAdvancedDraft({});
      setSavedFlash(true);
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setBusy(true);
    setTest(null);
    try {
      const env = await apiFetch<TestResult>("/admin/settings/ai/test", {
        method: "POST",
      });
      setTest(env.data);
    } catch (err) {
      setTest({
        ok: false,
        message: err instanceof Error ? err.message : "Gagal hubungi server",
      });
    } finally {
      setBusy(false);
    }
  }

  async function startEmbedSeed() {
    if (!confirm("Mulai seeding embeddings untuk 6.236 ayat? (~$0.01 sekali)"))
      return;
    setBusy(true);
    try {
      await apiFetch("/seed/start/embeddings", { method: "POST" });
      alert("Seed dimulai. Pantau progress di Seed Control.");
      await mutateCoverage();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mulai seed");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading && !mainRows) return <Spinner label="Memuat…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan AI"
        description="Setup AI untuk semantic search & fitur AI lain. Cukup paste OpenAI API key — selebihnya sudah ada default."
      />

      {/* Status banner */}
      <div
        className={`rounded-2xl border p-4 flex items-start gap-3 ${
          isAiReady
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-amber-50 border-amber-200 text-amber-900"
        }`}
      >
        {isAiReady ? (
          <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
        )}
        <div className="flex-1">
          <p className="font-semibold">
            {isAiReady ? "AI siap pakai" : "AI belum aktif"}
          </p>
          <p className="text-sm leading-relaxed mt-0.5">
            {isAiReady
              ? "API key tersimpan. Jalankan seeding embeddings di bawah agar /quran/ask & /tanya bisa me-ranking ayat."
              : "Paste OpenAI API key, simpan, lalu klik Test koneksi. Setelah hijau, mulai seeding embeddings."}
          </p>
        </div>
      </div>

      {/* Step 1: API key — the ONE thing that matters */}
      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
            1
          </span>
          <h2 className="font-semibold text-slate-900">OpenAI API key</h2>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          Dapatkan key dari{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer noopener"
            className="text-emerald-700 hover:text-emerald-800 underline inline-flex items-center gap-0.5"
          >
            platform.openai.com/api-keys
            <ExternalLink size={11} />
          </a>
          . Key disimpan terenkripsi (AES-256-GCM); ditampilkan hanya 4 char awal/akhir.
        </p>

        {/* Status box: shows current key state */}
        {apiKeyRow?.isConfigured && !apiKey && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Key tersimpan</p>
              <p className="font-mono text-sm text-slate-800 tabular-nums">
                {apiKeyRow.preview}
              </p>
            </div>
            <button
              onClick={clearApiKey}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold inline-flex items-center gap-1"
            >
              <RotateCcw size={12} /> Hapus
            </button>
          </div>
        )}

        {/* Input */}
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 mb-1.5 block">
              {apiKeyRow?.isConfigured
                ? "Ganti dengan key baru:"
                : "Paste key di sini:"}
            </span>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border-2 border-slate-200 px-4 py-3 text-sm font-mono pr-12 focus:outline-none focus:border-emerald-500"
              />
              {apiKey && (
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  aria-label={showKey ? "Sembunyikan" : "Tampilkan"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
          </label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={saveApiKey}
              disabled={!apiKey || busy}
              loading={busy}
            >
              Simpan
            </Button>
            {apiKeyRow?.isConfigured && (
              <Button
                type="button"
                variant="secondary"
                onClick={runTest}
                disabled={busy}
                icon={<PlayCircle size={14} />}
              >
                Test koneksi
              </Button>
            )}
            {savedFlash && (
              <span className="text-xs text-emerald-700 font-semibold inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> Tersimpan
              </span>
            )}
          </div>
        </div>

        {/* Test result */}
        {test && (
          <div
            className={`rounded-xl p-3 text-sm flex items-start gap-2 ${
              test.ok
                ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                : "bg-rose-50 border border-rose-200 text-rose-900"
            }`}
          >
            {test.ok ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            )}
            <span>
              {test.message}
              {typeof test.latencyMs === "number" && ` · ${test.latencyMs}ms`}
            </span>
          </div>
        )}
      </section>

      {/* Step 2: Embedding seed */}
      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
              isAiReady
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            2
          </span>
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
            <Wand2 size={16} className="text-emerald-700" />
            Seeding embeddings ayat
          </h2>
        </div>
        {coverage ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums">
                {coverage.percent}%
              </span>
              <span className="text-sm text-slate-500">
                {coverage.withEmbedding.toLocaleString("id-ID")} dari{" "}
                {coverage.totalAyat.toLocaleString("id-ID")} ayat ter-embed
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden bg-slate-100">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${coverage.percent}%` }}
              />
            </div>
            <div className="text-xs text-slate-500">
              {coverage.model ? (
                <>
                  Model: <code className="font-mono">{coverage.model}</code> ·
                  dim {coverage.dim}
                  {coverage.lastUpdate && (
                    <>
                      {" "}
                      · update terakhir{" "}
                      {new Date(coverage.lastUpdate).toLocaleString("id-ID")}
                    </>
                  )}
                </>
              ) : (
                "Belum pernah di-embed."
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="primary"
                onClick={startEmbedSeed}
                disabled={busy || !isAiReady}
                icon={<PlayCircle size={14} />}
              >
                {coverage.percent === 100
                  ? "Re-embed semua"
                  : coverage.percent > 0
                    ? "Lanjut seeding"
                    : "Mulai seeding embeddings"}
              </Button>
              <Link
                href="/admin/seed"
                className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold"
              >
                Lihat progress di Seed Control →
              </Link>
            </div>
            {!isAiReady && (
              <p className="text-xs text-amber-700">
                Simpan API key dulu sebelum mulai seed.
              </p>
            )}
          </>
        ) : (
          <Loader2 size={20} className="animate-spin text-slate-400" />
        )}
      </section>

      {/* Advanced settings — collapsed by default */}
      {advancedRows && advancedRows.length > 0 && (
        <section className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-slate-500" />
              <span className="font-semibold text-slate-900">
                Pengaturan lanjutan
              </span>
              <span className="text-xs text-slate-400">
                (model & base URL — biarkan default)
              </span>
            </div>
            <ChevronDown
              size={16}
              className={`transition-transform text-slate-500 ${
                advancedOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {advancedOpen && (
            <div className="border-t border-slate-100 p-5 space-y-3">
              {advancedRows.map((row) => {
                const inDraft = row.key in advancedDraft;
                const value = inDraft ? advancedDraft[row.key] : "";
                return (
                  <label key={row.key} className="block">
                    <span className="text-xs font-semibold text-slate-700 mb-1 block">
                      {row.label}
                    </span>
                    <input
                      value={value}
                      onChange={(e) =>
                        setAdvancedDraft((d) => ({
                          ...d,
                          [row.key]: e.target.value,
                        }))
                      }
                      placeholder={
                        row.isConfigured
                          ? `${row.preview} (kosongkan untuk pakai default)`
                          : "(belum di-set)"
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    />
                  </label>
                );
              })}
              <div className="flex items-center justify-end gap-2 pt-1">
                {Object.keys(advancedDraft).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAdvancedDraft({})}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Reset
                  </button>
                )}
                <Button
                  type="button"
                  variant="primary"
                  onClick={saveAdvanced}
                  disabled={Object.keys(advancedDraft).length === 0 || busy}
                  loading={busy}
                >
                  Simpan
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      <p className="text-xs text-slate-400">
        Setelah seeding selesai, fitur AI aktif di{" "}
        <Link href="/tanya" className="underline">
          /tanya
        </Link>{" "}
        dan toggle &quot;Tanya AI&quot; di beranda. Biaya embed sekali ~$0.01.
        Per query ~$0.000001 (Rp ~0,02).
      </p>
    </div>
  );
}
