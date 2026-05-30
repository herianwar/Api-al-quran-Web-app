"use client";

import {
  AlertTriangle,
  ArrowUp,
  BookOpen,
  Info,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Square,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

interface Hit {
  ayatId: number;
  surahNomor: number;
  surahNamaLatin: string;
  nomorAyat: number;
  teksArab: string;
  teksIndonesia: string;
  tafsirSnippet: string | null;
  score: number;
  matchedVia: "semantic" | "text" | "both";
}

interface AskResponse {
  q: string;
  conversationId: string;
  hits: Hit[];
  summary?: string;
  noResultReason?: string;
}

interface AskMeta {
  cached?: boolean;
  embedTokens?: number;
  llmTokensIn?: number;
  llmTokensOut?: number;
  latencyMs?: number;
}

interface Turn {
  id: string;
  role: "user" | "ai";
  text: string;
  hits?: Hit[];
  summary?: string;
  loading?: boolean;
  error?: string;
  meta?: AskMeta;
  matchedHitIds?: number[];
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

const SUGGESTIONS = [
  "ayat tentang keluarga",
  "ayat tentang sabar saat ujian",
  "ayat tentang rezeki",
  "ayat tentang orang tua",
  "ayat tentang taubat",
  "ayat tentang anak yatim",
  "ayat tentang ilmu",
  "ayat tentang kematian",
];

const DISCLAIMER_KEY = "rumahquran:tanya-disclaimer-dismissed";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export default function TanyaPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [recording, setRecording] = useState(false);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISCLAIMER_KEY);
    if (!dismissed) setShowDisclaimer(true);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const dismissDisclaimer = useCallback(() => {
    setShowDisclaimer(false);
    localStorage.setItem(DISCLAIMER_KEY, "1");
  }, []);

  async function send(q: string) {
    const text = q.trim();
    if (!text || busy) return;

    // Snapshot current turns BEFORE adding new ones, so the history we send
    // is the actual past context (not including the just-typed user msg).
    const snapshot = turns;
    const history = snapshot
      .filter((t) => t.role === "ai" && (t.matchedHitIds?.length ?? 0) > 0)
      .slice(-3)
      .map((t) => {
        const idx = snapshot.findIndex((tt) => tt.id === t.id);
        const userBefore = idx > 0 ? snapshot[idx - 1] : null;
        return {
          q: userBefore?.text ?? "",
          hitIds: t.matchedHitIds ?? [],
        };
      })
      .filter((h) => h.q && h.hitIds.length > 0);

    const userId = uid();
    const aiId = uid();
    setTurns((t) => [
      ...t,
      { id: userId, role: "user", text },
      { id: aiId, role: "ai", text: "Mencari ayat yang relevan…", loading: true },
    ]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/quran/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          limit: 8,
          withSummary: true,
          conversationId,
          history,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data: AskResponse;
        meta?: AskMeta;
        message?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.message || `HTTP ${res.status}`);
      }
      const data = json.data;
      if (data.conversationId) setConversationId(data.conversationId);
      setTurns((t) =>
        t.map((tu) =>
          tu.id === aiId
            ? {
                ...tu,
                loading: false,
                text:
                  data.hits.length > 0
                    ? `${data.hits.length} ayat paling relevan:`
                    : "Tidak ada ayat yang cukup relevan. Coba kata kunci lain.",
                hits: data.hits,
                summary: data.summary,
                matchedHitIds: data.hits.map((h) => h.ayatId),
                meta: json.meta,
              }
            : tu,
        ),
      );
    } catch (err) {
      setTurns((t) =>
        t.map((tu) =>
          tu.id === aiId
            ? {
                ...tu,
                loading: false,
                text:
                  err instanceof Error
                    ? err.message
                    : "Gagal menghubungi server",
                error: "error",
              }
            : tu,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function startRecording() {
    const r = getRecognition();
    if (!r) {
      alert("Browser ini belum support voice input. Coba Chrome atau Safari.");
      return;
    }
    r.lang = "id-ID";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e: SpeechRecognitionEventLike) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) setInput((s) => (s ? `${s} ${transcript}` : transcript));
    };
    r.onend = () => {
      setRecording(false);
      recogRef.current = null;
    };
    r.onerror = () => {
      setRecording(false);
      recogRef.current = null;
    };
    recogRef.current = r;
    setRecording(true);
    r.start();
  }
  function stopRecording() {
    recogRef.current?.stop();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }
  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  function resetConversation() {
    setTurns([]);
    setConversationId(undefined);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem-68px)] sm:h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-40 sm:pb-32">
        <div className="mx-auto max-w-3xl space-y-5">
          {showDisclaimer && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 p-4 flex items-start gap-3 text-sm">
              <Info size={18} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold mb-0.5">Catatan penting</p>
                <p className="text-xs leading-relaxed">
                  Hasil di-ranking AI berdasarkan kemiripan makna; bukan fatwa.
                  Untuk pemahaman lengkap, selalu rujuk tafsir terpercaya (Kemenag,
                  Ibnu Katsir) dan ulama. Kami menyediakan tafsir Kemenag di
                  halaman ayat masing-masing.
                </p>
              </div>
              <button
                onClick={dismissDisclaimer}
                className="text-amber-700 hover:text-amber-900 p-1"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {turns.length === 0 && (
            <div className="text-center pt-4 sm:pt-12 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                <Sparkles size={12} /> AI-powered
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
                Tanya Al-Qur&apos;an
              </h1>
              <p className="text-slate-500 max-w-lg mx-auto leading-relaxed">
                Tulis pertanyaan natural. AI akan jawab dengan ringkasan + ayat-ayat
                relevan, lengkap dengan tafsir Kemenag singkat.
              </p>
              <div className="grid sm:grid-cols-2 gap-2 max-w-2xl mx-auto pt-4">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 text-left hover:border-emerald-400 hover:bg-emerald-50 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t) => (
            <TurnView key={t.id} turn={t} />
          ))}

          <div ref={endRef} />
        </div>
      </div>

      <div className="fixed bottom-[68px] sm:bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-white/0 pt-6 pb-4 sm:pb-6 px-4">
        <div className="mx-auto max-w-3xl">
          {turns.length > 0 && (
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 px-1">
              <span>
                {conversationId && (
                  <>
                    Sesi:{" "}
                    <code className="font-mono">{conversationId.slice(0, 8)}</code>
                  </>
                )}
              </span>
              <button
                onClick={resetConversation}
                className="inline-flex items-center gap-1 hover:text-slate-700"
              >
                <RefreshCw size={11} /> Sesi baru
              </button>
            </div>
          )}
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
          >
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={busy}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
                recording
                  ? "bg-rose-500 text-white"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
              aria-label={recording ? "Berhenti merekam" : "Voice input"}
              title="Voice input (id-ID)"
            >
              {recording ? (
                <Square size={14} fill="currentColor" />
              ) : (
                <Mic size={16} />
              )}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="ayat tentang…"
              rows={1}
              disabled={busy}
              className="flex-1 resize-none bg-transparent px-1 py-2 text-sm sm:text-base leading-relaxed focus:outline-none placeholder:text-slate-400 max-h-32"
              style={{ minHeight: "40px" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(128, el.scrollHeight)}px`;
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              aria-label="Kirim"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowUp size={16} />
              )}
            </button>
          </form>
          <p className="text-[10px] text-slate-400 text-center mt-1.5">
            Tekan Enter untuk kirim · Shift+Enter untuk baris baru
          </p>
        </div>
      </div>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl bg-emerald-600 text-white px-4 py-2.5 text-sm shadow-sm break-words">
          {turn.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700">
        <Sparkles size={14} />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {turn.summary && (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-bold mb-1.5 inline-flex items-center gap-1">
              <Zap size={10} /> Ringkasan AI
            </p>
            <p className="text-sm text-slate-800 leading-relaxed">
              {turn.summary}
            </p>
          </div>
        )}

        <p className="text-sm text-slate-600 flex items-center gap-2">
          {turn.loading && <Loader2 size={12} className="animate-spin" />}
          {turn.error && <AlertTriangle size={12} className="text-rose-500" />}
          <span className={turn.error ? "text-rose-600" : ""}>{turn.text}</span>
        </p>

        {turn.hits && turn.hits.length > 0 && (
          <ul className="space-y-2">
            {turn.hits.map((h) => (
              <li
                key={h.ayatId}
                className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <Link
                    href={`/surat/${h.surahNomor}#ayat-${h.nomorAyat}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <BookOpen size={12} /> Q.S. {h.surahNamaLatin} {h.surahNomor}:{h.nomorAyat}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                        h.matchedVia === "both"
                          ? "bg-emerald-100 text-emerald-700"
                          : h.matchedVia === "semantic"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                      title={
                        h.matchedVia === "both"
                          ? "Match dari makna & teks"
                          : h.matchedVia === "semantic"
                            ? "Match dari makna"
                            : "Match dari teks"
                      }
                    >
                      {h.matchedVia === "both"
                        ? "makna+teks"
                        : h.matchedVia === "semantic"
                          ? "makna"
                          : "teks"}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {Math.round(h.score * 100)}%
                    </span>
                  </div>
                </div>
                <p className="arabic text-xl sm:text-2xl text-right leading-loose text-slate-900 break-words">
                  {h.teksArab}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed mt-2">
                  {h.teksIndonesia}
                </p>
                {h.tafsirSnippet && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-emerald-700 hover:text-emerald-800 font-semibold">
                      Tafsir Kemenag (ringkas)
                    </summary>
                    <p className="mt-1.5 text-slate-600 leading-relaxed bg-emerald-50/50 border-l-2 border-emerald-200 pl-3 py-1.5">
                      {h.tafsirSnippet}
                    </p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}

        {(turn.meta?.latencyMs || turn.meta?.cached) && (
          <p className="text-[10px] text-slate-400 font-mono">
            {turn.meta.latencyMs}ms
            {turn.meta.cached && " · cached"}
            {(turn.meta.llmTokensIn ?? 0) + (turn.meta.llmTokensOut ?? 0) > 0 && (
              <>
                {" "}
                · {(turn.meta.llmTokensIn ?? 0) + (turn.meta.llmTokensOut ?? 0)} token LLM
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
