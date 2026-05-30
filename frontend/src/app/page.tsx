"use client";

import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Compass,
  Feather,
  Hand,
  Heart,
  Moon,
  PlayCircle,
  ScrollText,
  Search,
  Sparkles,
  Sunrise,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { hijriToday } from "@/lib/hijri";
import type { Ayat, Hadis, SurahListItem } from "@/lib/types";
import { ErrorBox } from "@/components/Spinner";
import { CardRowSkeleton, Skeleton } from "@/components/Skeleton";
import { SurahCard } from "@/components/SurahCard";

function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const QUICK_ACTIONS = [
  {
    href: "/topic",
    label: "Tematik",
    desc: "Ayat per tema",
    icon: Sparkles,
    bg: "bg-amber-50",
    ring: "ring-amber-100",
    text: "text-amber-700",
  },
  {
    href: "/doa",
    label: "Doa",
    desc: "227 doa harian",
    icon: Heart,
    bg: "bg-rose-50",
    ring: "ring-rose-100",
    text: "text-rose-700",
  },
  {
    href: "/hadis",
    label: "Hadis",
    desc: "9 perawi besar",
    icon: Compass,
    bg: "bg-indigo-50",
    ring: "ring-indigo-100",
    text: "text-indigo-700",
  },
  {
    href: "/sholat",
    label: "Sholat",
    desc: "Jadwal kotamu",
    icon: Moon,
    bg: "bg-sky-50",
    ring: "ring-sky-100",
    text: "text-sky-700",
  },
  {
    href: "/asmaul-husna",
    label: "Asmaul Husna",
    desc: "99 Nama Allah",
    icon: Feather,
    bg: "bg-emerald-50",
    ring: "ring-emerald-100",
    text: "text-emerald-700",
  },
  {
    href: "/shalat/niat",
    label: "Niat Shalat",
    desc: "5 niat wajib",
    icon: Hand,
    bg: "bg-teal-50",
    ring: "ring-teal-100",
    text: "text-teal-700",
  },
  {
    href: "/shalat/bacaan",
    label: "Bacaan Shalat",
    desc: "Tata cara lengkap",
    icon: BookOpen,
    bg: "bg-cyan-50",
    ring: "ring-cyan-100",
    text: "text-cyan-700",
  },
  {
    href: "/tahlil",
    label: "Tahlil",
    desc: "Urutan bacaan lengkap",
    icon: ScrollText,
    bg: "bg-violet-50",
    ring: "ring-violet-100",
    text: "text-violet-700",
  },
  {
    href: "/sajdah",
    label: "Ayat Sajdah",
    desc: "15 ayat sujud tilawah",
    icon: BookMarked,
    bg: "bg-fuchsia-50",
    ring: "ring-fuchsia-100",
    text: "text-fuchsia-700",
  },
] as const;

function greetingByHour(): { sapaan: string; ikon: typeof Sunrise } {
  const h = new Date().getHours();
  if (h < 4) return { sapaan: "Sahur sehat", ikon: Moon };
  if (h < 11) return { sapaan: "Selamat pagi", ikon: Sunrise };
  if (h < 15) return { sapaan: "Selamat siang", ikon: Sunrise };
  if (h < 18) return { sapaan: "Selamat sore", ikon: Sunrise };
  return { sapaan: "Selamat malam", ikon: Moon };
}

/** Format the Gregorian + Hijri date in Indonesian. Hijri uses a local
 * tabular-Islamic converter so it works without any extra API call. */
function formatToday(): string {
  return new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const STORAGE_LAST_READ = "rumahquran:lastRead";

interface LastRead {
  surahNomor: number;
  namaLatin: string;
  ayat?: number;
  at: number;
}

export default function HomePage() {
  const [mode, setMode] = useState<"surat" | "ayat" | "tanya">("surat");
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim());
  const [greet, setGreet] = useState<ReturnType<typeof greetingByHour> | null>(
    null,
  );
  const [today, setToday] = useState<string | null>(null);
  const [hijri, setHijri] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<LastRead | null>(null);

  useEffect(() => {
    setGreet(greetingByHour());
    setToday(formatToday());
    setHijri(hijriToday().hijri.formatted);
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_LAST_READ);
        if (raw) setLastRead(JSON.parse(raw) as LastRead);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const { data: surahs, error, isLoading } = useSWR<SurahListItem[]>(
    "/quran/surat",
    fetcher,
  );

  const { data: dailyAyat } = useSWR<Ayat>("/quran/random", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const { data: dailyHadis } = useSWR<Hadis>("/hadith/random", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const { data: ayatResults, isLoading: searching } = useSWR<Ayat[]>(
    mode === "ayat" && debounced.length >= 2
      ? `/quran/search?q=${encodeURIComponent(debounced)}&lang=id&limit=30`
      : null,
    fetcher,
  );

  interface AskHit {
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
  const { data: aiResults, isLoading: aiSearching, error: aiError } =
    useSWR<{ q: string; hits: AskHit[]; summary?: string }>(
      mode === "tanya" && debounced.length >= 3
        ? `/quran/ask?q=${encodeURIComponent(debounced)}&limit=12`
        : null,
      fetcher,
    );

  const filtered = useMemo(() => {
    if (!surahs) return [];
    if (mode !== "surat" || !query.trim()) return surahs;
    const q = query.trim().toLowerCase();
    return surahs.filter(
      (s) =>
        s.namaLatin.toLowerCase().includes(q) ||
        s.arti.toLowerCase().includes(q) ||
        String(s.nomor) === q,
    );
  }, [surahs, query, mode]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-7">
      {/* ─── Hero: glassmorphism over aurora gradient ─────────────────── */}
      <section className="relative overflow-hidden rounded-3xl fade-in-up">
        {/* Animated aurora background */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600" />
        <div
          aria-hidden
          className="absolute -right-20 -top-20 w-[420px] h-[420px] rounded-full bg-cyan-400/30 blur-3xl aurora"
        />
        <div
          aria-hidden
          className="absolute -left-16 -bottom-24 w-[480px] h-[480px] rounded-full bg-emerald-900/40 blur-3xl aurora"
          style={{ animationDelay: "-6s" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 dot-grid opacity-30"
          style={{
            maskImage: "radial-gradient(closest-side, black, transparent)",
          }}
        />

        <div className="relative px-5 sm:px-9 py-7 sm:py-11 text-white">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              {greet && (
                <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-emerald-50/90 uppercase tracking-[0.18em]">
                  <span className="inline-flex items-center gap-1.5">
                    <greet.ikon size={13} />
                    {greet.sapaan}
                  </span>
                  {today && (
                    <span className="text-emerald-100/70 font-medium normal-case tracking-normal">
                      · {today}
                    </span>
                  )}
                  {hijri && (
                    <Link
                      href="/hijri"
                      className="text-amber-100/90 font-medium normal-case tracking-normal hover:underline"
                    >
                      · {hijri}
                    </Link>
                  )}
                </p>
              )}
              <p className="arabic text-3xl sm:text-5xl mt-3 mb-2 leading-snug opacity-95">
                بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ
              </p>
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
                Pintumu menuju
                <br className="hidden sm:block" />{" "}
                <span className="text-amber-100/95">
                  Al-Qur&apos;an, Hadis, &amp; Doa.
                </span>
              </h1>
              <p className="text-emerald-50/85 max-w-xl text-sm leading-relaxed mt-2 sm:mt-3">
                Semua sumber Islam Indonesia dalam satu tempat — tanpa iklan,
                tanpa tracking, self-hosted.
              </p>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-xs text-emerald-50/80">
            <span className="inline-flex items-baseline gap-1">
              <strong className="text-white font-bold text-sm tabular-nums">
                114
              </strong>
              surat
            </span>
            <span className="inline-flex items-baseline gap-1">
              <strong className="text-white font-bold text-sm tabular-nums">
                6.236
              </strong>
              ayat
            </span>
            <span className="inline-flex items-baseline gap-1">
              <strong className="text-white font-bold text-sm tabular-nums">
                38.102
              </strong>
              hadis
            </span>
            <span className="inline-flex items-baseline gap-1">
              <strong className="text-white font-bold text-sm tabular-nums">
                227
              </strong>
              doa
            </span>
            <span className="inline-flex items-baseline gap-1">
              <strong className="text-white font-bold text-sm tabular-nums">
                99
              </strong>
              asmaul husna
            </span>
            <span className="inline-flex items-baseline gap-1">
              <strong className="text-white font-bold text-sm tabular-nums">
                518
              </strong>
              kota
            </span>
          </div>
        </div>
      </section>

      {/* ─── Continue reading (only when localStorage has data) ───────── */}
      {lastRead && (
        <Link
          href={`/surat/${lastRead.surahNomor}${lastRead.ayat ? `#ayat-${lastRead.ayat}` : ""}`}
          className="group glass rounded-2xl px-5 py-4 flex items-center gap-4 fade-in-up glow-on-hover"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <PlayCircle size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700 mb-0.5">
              Lanjutkan baca
            </p>
            <p className="font-semibold text-slate-900 truncate">
              {lastRead.namaLatin}
              {lastRead.ayat ? ` · ayat ${lastRead.ayat}` : ""}
            </p>
          </div>
          <ArrowRight
            size={18}
            className="text-slate-400 group-hover:text-emerald-700 group-hover:translate-x-1 transition shrink-0"
          />
        </Link>
      )}

      {/* ─── Quick actions — horizontal scroll on mobile ──────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-2.5 px-1">
          <h2 className="section-eyebrow">
            <Compass size={12} /> Akses cepat
          </h2>
        </div>
        <div className="scroll-row -mx-4 px-4 overflow-x-auto sm:overflow-visible sm:mx-0 sm:px-0">
          <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-3 gap-3 min-w-max sm:min-w-0">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="card glow-on-hover flex items-center gap-3 p-4 fade-in-up min-w-[180px] sm:min-w-0"
              >
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${a.bg} ${a.ring} ${a.text}`}
                >
                  <a.icon size={20} strokeWidth={2.25} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900 text-sm">
                    {a.label}
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {a.desc}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Daily ayat + Daily hadis ─────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Daily ayat takes 2 columns on desktop */}
        <Link
          href={
            dailyAyat?.surah
              ? `/surat/${dailyAyat.surah.nomor}#ayat-${dailyAyat.nomorAyat}`
              : "/"
          }
          className="lg:col-span-2 card glow-on-hover relative overflow-hidden p-6 fade-in-up"
        >
          <div
            aria-hidden
            className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-emerald-50 blur-2xl"
          />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <span className="section-eyebrow">
                <Sparkles size={12} /> Ayat untukmu
              </span>
              {dailyAyat?.surah && (
                <span className="chip">
                  {dailyAyat.surah.namaLatin} · {dailyAyat.nomorAyat}
                </span>
              )}
            </div>
            {dailyAyat ? (
              <>
                <p className="arabic arabic-body text-right text-slate-900 mb-4 leading-relaxed">
                  {dailyAyat.teksArab}
                </p>
                <p className="text-[15px] leading-relaxed text-slate-700">
                  {dailyAyat.teksIndonesia}
                </p>
              </>
            ) : (
              <div className="space-y-2.5">
                <Skeleton width="100%" height={28} />
                <Skeleton width="90%" height={28} />
                <Skeleton width="70%" height={14} />
                <Skeleton width="55%" height={14} />
              </div>
            )}
          </div>
        </Link>

        {/* Daily hadis */}
        <Link
          href={
            dailyHadis?.perawi
              ? `/hadis/${dailyHadis.perawi.slug}/${dailyHadis.nomor}`
              : "/hadis"
          }
          className="card glow-on-hover relative overflow-hidden p-6 fade-in-up flex flex-col"
        >
          <div
            aria-hidden
            className="absolute -left-12 -bottom-12 w-40 h-40 rounded-full bg-amber-50 blur-2xl"
          />
          <div className="relative flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="section-eyebrow">
                <Compass size={12} /> Hadis pilihan
              </span>
              {dailyHadis?.perawi && (
                <span className="chip chip-gold">
                  {dailyHadis.perawi.nama} · {dailyHadis.nomor}
                </span>
              )}
            </div>
            {dailyHadis ? (
              <p className="text-[14px] leading-relaxed text-slate-700 line-clamp-6 flex-1">
                {dailyHadis.terjemahan}
              </p>
            ) : (
              <div className="space-y-2.5">
                <Skeleton width="100%" height={14} />
                <Skeleton width="100%" height={14} />
                <Skeleton width="95%" height={14} />
                <Skeleton width="85%" height={14} />
                <Skeleton width="60%" height={14} />
              </div>
            )}
          </div>
        </Link>
      </section>

      {/* ─── Surah / Ayat search ──────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3 px-1 gap-3 flex-wrap">
          <h2 className="section-eyebrow">
            <BookOpen size={12} /> Mulai membaca
          </h2>
          {surahs && mode === "surat" && (
            <p className="text-xs text-slate-500 tabular-nums">
              {filtered.length} surat
            </p>
          )}
        </div>

        <div className="mb-5 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-white shadow-sm self-start flex-wrap">
            {(["surat", "ayat", "tanya"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5 ${
                  mode === m
                    ? m === "tanya"
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm"
                      : "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-emerald-700"
                }`}
              >
                {m === "surat" && "Cari Surat"}
                {m === "ayat" && "Cari Ayat"}
                {m === "tanya" && (
                  <>
                    <Sparkles size={12} /> Tanya AI
                  </>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "surat"
                  ? "Cari nama surat (mis. Al-Baqarah)…"
                  : mode === "ayat"
                    ? "Cari kata dalam terjemah (mis. sabar, rezeki)…"
                    : "Tulis pertanyaan (mis. ayat tentang keluarga)…"
              }
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
            />
          </div>
        </div>

        {error && <ErrorBox message={`Gagal memuat data: ${error.message}`} />}

        {mode === "tanya" ? (
          <div>
            {debounced.length < 3 ? (
              <p className="text-sm text-slate-500 py-12 text-center">
                Tulis pertanyaan natural — misal &quot;ayat tentang keluarga&quot;.
                <Link href="/tanya" className="block mt-2 text-emerald-700 font-semibold hover:underline">
                  Atau buka mode chat penuh →
                </Link>
              </p>
            ) : aiSearching ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="card p-5 space-y-3">
                    <Skeleton width={120} height={14} />
                    <Skeleton width="100%" height={22} />
                    <Skeleton width="90%" height={14} />
                  </div>
                ))}
              </div>
            ) : aiError ? (
              <div className="card p-5 bg-amber-50 border-amber-200 text-amber-900 text-sm">
                AI search belum siap. {(aiError as Error).message}.{" "}
                <Link href="/admin/settings/ai" className="font-semibold underline">
                  Konfigurasi di admin
                </Link>
              </div>
            ) : !aiResults || aiResults.hits.length === 0 ? (
              <p className="text-sm text-slate-500 py-12 text-center">
                Tidak ada ayat yang cocok untuk pertanyaan ini.
              </p>
            ) : (
              <div className="space-y-3">
                {aiResults.summary && (
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-4 fade-in-up">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-bold mb-1.5">
                      Ringkasan AI
                    </p>
                    <p className="text-sm text-slate-800 leading-relaxed">
                      {aiResults.summary}
                    </p>
                  </div>
                )}
                <p className="text-xs text-slate-400 px-1">
                  {aiResults.hits.length} ayat paling relevan untuk &quot;{debounced}&quot;
                  <Link
                    href="/tanya"
                    className="ml-2 text-emerald-700 hover:text-emerald-800 font-semibold"
                  >
                    Buka mode chat →
                  </Link>
                </p>
                {aiResults.hits.map((h) => (
                  <Link
                    key={h.ayatId}
                    href={`/surat/${h.surahNomor}#ayat-${h.nomorAyat}`}
                    className="card glow-on-hover block p-5 fade-in-up"
                  >
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <span className="chip">
                        {h.surahNamaLatin} · ayat {h.nomorAyat}
                      </span>
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
                              ? "Match makna & teks"
                              : h.matchedVia === "semantic"
                                ? "Match makna"
                                : "Match teks"
                          }
                        >
                          {h.matchedVia === "both"
                            ? "makna+teks"
                            : h.matchedVia === "semantic"
                              ? "makna"
                              : "teks"}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {Math.round(h.score * 100)}%
                        </span>
                      </div>
                    </div>
                    <p className="arabic arabic-body text-right text-slate-900 mb-3 break-words">
                      {h.teksArab}
                    </p>
                    <p className="text-[15px] leading-relaxed text-slate-700">
                      {h.teksIndonesia}
                    </p>
                    {h.tafsirSnippet && (
                      <p className="text-xs leading-relaxed text-slate-500 mt-3 pl-3 border-l-2 border-emerald-200 italic">
                        {h.tafsirSnippet}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : mode === "ayat" ? (
          <div>
            {debounced.length < 2 ? (
              <p className="text-sm text-slate-500 py-12 text-center">
                Ketik minimal 2 huruf untuk mencari ayat.
              </p>
            ) : searching ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="card p-5 space-y-3">
                    <Skeleton width={120} height={14} />
                    <Skeleton width="100%" height={22} />
                    <Skeleton width="90%" height={14} />
                  </div>
                ))}
              </div>
            ) : !ayatResults || ayatResults.length === 0 ? (
              <p className="text-sm text-slate-500 py-12 text-center">
                Tidak ada hasil untuk &quot;{debounced}&quot;.
              </p>
            ) : (
              <div className="space-y-3">
                {ayatResults.map((a) => (
                  <Link
                    key={a.id}
                    href={`/surat/${a.surah?.nomor}#ayat-${a.nomorAyat}`}
                    className="card glow-on-hover block p-5 fade-in-up"
                  >
                    <span className="chip mb-3">
                      {a.surah?.namaLatin} · ayat {a.nomorAyat}
                    </span>
                    <p className="arabic arabic-body text-right text-slate-900 mb-3">
                      {a.teksArab}
                    </p>
                    <p className="text-[15px] leading-relaxed text-slate-700">
                      {a.teksIndonesia}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <CardRowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <div key={s.nomor} className="fade-in-up">
                <SurahCard surah={s} />
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-slate-500 col-span-full py-12 text-center">
                Surat tidak ditemukan. Coba kata kunci lain.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
