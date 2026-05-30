"use client";

import {
  ArrowLeft,
  ArrowUp,
  BookMarked,
  ChevronDown,
  Loader2,
  MessageSquare,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { API_URL, fetcher, fetcherFull } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";

interface RelatedTopic {
  slug: string;
  nama: string;
  score: number;
}

interface ReadingPlanDay {
  day: number;
  tema: string;
  ayatIds: number[];
}

interface TopicDetail {
  slug: string;
  nama: string;
  deskripsi: string | null;
  aiSummary: string | null;
  aiSummaryAt: string | null;
  readingPlan: ReadingPlanDay[] | null;
  readingPlanAt: string | null;
  curatedCount: number;
  aiCount: number;
  related: RelatedTopic[];
}

interface TopicAyat {
  id: number;
  nomorAyat: number;
  teksArab: string;
  teksLatin: string;
  teksIndonesia: string;
  catatan: string | null;
  source: "curated" | "ai";
  aiScore: number | null;
  surah: { nomor: number; nama: string; namaLatin: string };
}

interface AskHit {
  ayatId: number;
  surahNomor: number;
  surahNamaLatin: string;
  nomorAyat: number;
  teksArab: string;
  teksIndonesia: string;
  score: number;
}

export default function TopicDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [source, setSource] = useState<"curated" | "ai">("curated");
  const [page, setPage] = useState(1);

  const { data: topic, error: topicErr } = useSWR<TopicDetail>(
    slug ? `/topic/${slug}` : null,
    fetcher,
  );

  const { data: ayatPage, error: ayatErr, isLoading } = useSWR(
    slug ? `/topic/${slug}/ayat?source=${source}&page=${page}&limit=20` : null,
    fetcherFull<TopicAyat[]>,
  );

  // Reset to page 1 when source toggles.
  useEffect(() => setPage(1), [source]);

  if (!slug) return <ErrorBox message="Slug topik tidak valid." />;
  if (topicErr) return <ErrorBox message={(topicErr as Error).message} />;
  if (!topic) return <Spinner label="Memuat tema…" />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <Link
        href="/topic"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-700"
      >
        <ArrowLeft size={14} /> Semua tema
      </Link>

      <header>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          {topic.nama}
        </h1>
        {topic.deskripsi && (
          <p className="text-slate-600 mt-2 leading-relaxed">
            {topic.deskripsi}
          </p>
        )}
        <div className="flex items-center gap-2 mt-3 text-xs">
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-0.5 font-semibold">
            {topic.curatedCount} ayat utama
          </span>
          {topic.aiCount > 0 && (
            <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-0.5 font-semibold inline-flex items-center gap-1">
              <Sparkles size={10} /> +{topic.aiCount} AI
            </span>
          )}
        </div>
      </header>

      {topic.aiSummary && (
        <section className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-bold mb-1.5 inline-flex items-center gap-1">
            <Zap size={10} /> Ringkasan AI
          </p>
          <p className="text-sm text-slate-800 leading-relaxed">
            {topic.aiSummary}
          </p>
        </section>
      )}

      <ScopedAsk slug={topic.slug} nama={topic.nama} />

      {topic.readingPlan && topic.readingPlan.length > 0 && (
        <ReadingPlanCard plan={topic.readingPlan} />
      )}

      <div className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 max-w-fit">
        <button
          onClick={() => setSource("curated")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            source === "curated"
              ? "bg-white shadow text-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Ayat utama
          <span className="ml-1.5 text-xs font-mono opacity-70">
            {topic.curatedCount}
          </span>
        </button>
        {topic.aiCount > 0 && (
          <button
            onClick={() => setSource("ai")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition inline-flex items-center gap-1.5 ${
              source === "ai"
                ? "bg-white shadow text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Sparkles size={12} /> Tambahan AI
            <span className="ml-0.5 text-xs font-mono opacity-70">
              {topic.aiCount}
            </span>
          </button>
        )}
      </div>

      {ayatErr && <ErrorBox message={(ayatErr as Error).message} />}
      {isLoading && <Spinner label="Memuat ayat…" />}

      {ayatPage && ayatPage.data.length === 0 && (
        <p className="text-slate-500 text-sm py-12 text-center">
          {source === "ai"
            ? 'Belum ada ayat AI. Admin perlu klik "Auto-expand" di /admin/content/topic.'
            : "Belum ada ayat di topik ini."}
        </p>
      )}

      <ol className="space-y-3">
        {ayatPage?.data.map((a) => (
          <li key={`${a.id}-${a.source}`} className="card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Link
                href={`/surat/${a.surah.nomor}#ayat-${a.nomorAyat}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <BookMarked size={12} /> Q.S. {a.surah.namaLatin} {a.surah.nomor}:
                {a.nomorAyat}
              </Link>
              <div className="flex items-center gap-1.5">
                {a.source === "ai" && (
                  <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                    <Sparkles size={9} /> AI
                  </span>
                )}
                {a.aiScore !== null && (
                  <span className="text-[10px] font-mono text-slate-400">
                    {Math.round(a.aiScore * 100)}%
                  </span>
                )}
              </div>
            </div>
            <p className="arabic text-xl sm:text-2xl text-right leading-loose text-slate-900 break-words">
              {a.teksArab}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {a.teksIndonesia}
            </p>
            {a.catatan && (
              <p className="text-xs italic text-slate-500 pl-3 border-l-2 border-amber-200">
                {a.catatan}
              </p>
            )}
          </li>
        ))}
      </ol>

      {ayatPage && ayatPage.meta && (ayatPage.meta.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
          >
            ← Sebelumnya
          </button>
          <span className="text-slate-500 tabular-nums">
            {page} / {ayatPage.meta.totalPages}
          </span>
          <button
            disabled={page >= (ayatPage.meta.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
          >
            Selanjutnya →
          </button>
        </div>
      )}

      {topic.related.length > 0 && (
        <section className="card p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">
            Topik terkait
          </h2>
          <ul className="flex flex-wrap gap-2">
            {topic.related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/topic/${r.slug}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 text-sm font-medium text-slate-700 border border-slate-200 hover:border-emerald-300 transition"
                >
                  {r.nama}
                  <span className="text-[10px] font-mono text-slate-400">
                    {Math.round(r.score * 100)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ScopedAsk({ slug, nama }: { slug: string; nama: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<AskHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setHits(null);
    try {
      const res = await fetch(`${API_URL}/topic/${slug}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: q.trim(), limit: 5 }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data: { hits: AskHit[]; message?: string };
        message?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.message || `HTTP ${res.status}`);
      }
      setHits(json.data.hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 space-y-3">
      <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
        <MessageSquare size={16} className="text-emerald-700" />
        Tanya tentang {nama.toLowerCase()}
      </h2>
      <p className="text-xs text-slate-500">
        AI cari ayat yang paling cocok pertanyaan kamu — di dalam pool topik ini.
      </p>
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`mis. "${nama.toLowerCase()} dalam keluarga"`}
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
        />
        <button
          type="submit"
          disabled={!q.trim() || busy}
          className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          aria-label="Tanya"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ArrowUp size={14} />
          )}
        </button>
      </form>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {hits && hits.length === 0 && (
        <p className="text-sm text-slate-500">
          Tidak ada ayat yang cukup cocok di topik ini.
        </p>
      )}

      {hits && hits.length > 0 && (
        <ul className="space-y-2">
          {hits.map((h) => (
            <li
              key={h.ayatId}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <Link
                  href={`/surat/${h.surahNomor}#ayat-${h.nomorAyat}`}
                  className="text-xs font-semibold text-emerald-700"
                >
                  Q.S. {h.surahNamaLatin} {h.surahNomor}:{h.nomorAyat}
                </Link>
                <span className="text-[10px] font-mono text-slate-400">
                  {Math.round(h.score * 100)}%
                </span>
              </div>
              <p className="arabic text-base text-right leading-loose text-slate-900 break-words">
                {h.teksArab}
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {h.teksIndonesia}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReadingPlanCard({ plan }: { plan: ReadingPlanDay[] }) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => [...plan].sort((a, b) => a.day - b.day),
    [plan],
  );

  return (
    <section className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50"
      >
        <span className="flex items-center gap-2 font-semibold text-slate-900">
          <Wand2 size={16} className="text-emerald-700" />
          Rencana baca 7 hari
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform text-slate-400 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <ol className="border-t border-slate-100 divide-y divide-slate-100">
          {sorted.map((d) => (
            <li key={d.day} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs shrink-0">
                  {d.day}
                </span>
                <p className="font-semibold text-slate-900">{d.tema}</p>
              </div>
              <p className="text-xs text-slate-500 pl-11">
                {d.ayatIds.length} ayat untuk dibaca hari ini
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
