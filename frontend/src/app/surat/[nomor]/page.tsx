"use client";

import {
  ArrowUp,
  ChevronDown,
  Info,
  Minus,
  Pause,
  Play,
  Plus,
  Repeat,
  SkipBack,
  SkipForward,
  Sliders,
  Type,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, apiFetch, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  Bookmark,
  Hafalan,
  Qari,
  SurahDetail,
  TafsirSourceMeta,
  TafsirSurah,
  TranslationSourceMeta,
  TranslationSurah,
} from "@/lib/types";
import { AyatItem } from "@/components/AyatItem";
import { ErrorBox, Spinner } from "@/components/Spinner";

export default function SuratPage() {
  const params = useParams<{ nomor: string }>();
  // params can be `{}` on initial render; coerce to a positive integer in
  // 1..114 to avoid firing `/quran/surat/undefined` or `/quran/surat/NaN`.
  const nomor = (() => {
    const raw = params?.nomor;
    const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 114 ? n : null;
  })();
  const { user } = useAuth();

  const { data: surah, error, isLoading } = useSWR<SurahDetail>(
    nomor ? `/quran/surat/${nomor}` : null,
    fetcher,
  );

  // Save current surah as "lanjutkan baca" target for the home page hero.
  useEffect(() => {
    if (!surah || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "rumahquran:lastRead",
        JSON.stringify({
          surahNomor: surah.nomor,
          namaLatin: surah.namaLatin,
          at: Date.now(),
        }),
      );
    } catch {
      /* localStorage quota / privacy mode — silently skip */
    }
  }, [surah]);
  const { data: qariList } = useSWR<Qari[]>("/audio/qari", fetcher);
  const { data: tafsirSources } = useSWR<TafsirSourceMeta[]>(
    "/tafsir/list",
    fetcher,
  );
  const { data: translationSources } = useSWR<TranslationSourceMeta[]>(
    "/translation/list",
    fetcher,
  );
  const [tafsirSumber, setTafsirSumber] = useState<string>("kemenag");
  const [translationSumber, setTranslationSumber] = useState<string>("");
  const { data: tafsir } = useSWR<TafsirSurah>(
    nomor ? `/tafsir/${nomor}?sumber=${tafsirSumber}` : null,
    fetcher,
    // keepPreviousData: avoid flash of "no tafsir" when user switches the
    // source dropdown — show stale text until the new source loads.
    { shouldRetryOnError: false, keepPreviousData: true },
  );
  const { data: extraTranslation } = useSWR<TranslationSurah>(
    nomor && translationSumber
      ? `/translation/${translationSumber}/${nomor}`
      : null,
    fetcher,
    { shouldRetryOnError: false, keepPreviousData: true },
  );
  interface AsbabSurat {
    entries: { nomorAyat: number; teks: string; sumber: string | null }[];
  }
  const { data: asbab } = useSWR<AsbabSurat>(
    nomor ? `/asbab-nuzul/${nomor}` : null,
    fetcher,
    { shouldRetryOnError: false },
  );
  const { data: bookmarks, mutate: mutateBookmarks } = useSWR<Bookmark[]>(
    user ? "/user/bookmark" : null,
    fetcher,
  );
  const { data: hafalan, mutate: mutateHafalan } = useSWR<Hafalan[]>(
    user ? "/user/hafalan" : null,
    fetcher,
  );

  interface AyatNoteListItem {
    id: string;
    ayatId: number;
    judul: string | null;
    body: string;
  }
  const { data: notesPage, mutate: mutateNotes } = useSWR<AyatNoteListItem[]>(
    user ? "/me/notes?limit=500" : null,
    fetcher,
  );
  const notesByAyat = useMemo(() => {
    const map = new Map<number, AyatNoteListItem[]>();
    (notesPage ?? []).forEach((n) => {
      const arr = map.get(n.ayatId) ?? [];
      arr.push(n);
      map.set(n.ayatId, arr);
    });
    return map;
  }, [notesPage]);

  const [qari, setQari] = useState("05");
  // Audio playback model: `currentAyatId` is the ayat loaded into the player
  // (null = player hidden), `isPlaying` mirrors the <audio> element's state.
  const [currentAyatId, setCurrentAyatId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [openTafsir, setOpenTafsir] = useState<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Reader display preferences — persisted to localStorage so the reader's
  // chosen font size / visible layers carry across surahs and sessions.
  interface ReaderPrefs {
    arabicScale: number; // multiplier applied to .arabic-body via --arabic-scale
    showLatin: boolean;
    showTranslation: boolean;
    continuous: boolean; // auto-advance to the next ayat when audio ends
  }
  const DEFAULT_PREFS: ReaderPrefs = {
    arabicScale: 1,
    showLatin: true,
    showTranslation: true,
    continuous: true,
  };
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  function setPref<K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("rumahquran:readerPrefs");
      if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) }));
    } catch {
      /* corrupt/blocked storage — fall back to defaults */
    }
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      window.localStorage.setItem(
        "rumahquran:readerPrefs",
        JSON.stringify(prefs),
      );
    } catch {
      /* ignore */
    }
  }, [prefs, prefsLoaded]);

  // Toolbar / chrome UI state.
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [showTopBtn, setShowTopBtn] = useState(false);

  // Reading-progress bar + back-to-top visibility, driven by window scroll.
  useEffect(() => {
    function onScroll() {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setScrollPct(max > 0 ? (el.scrollTop / max) * 100 : 0);
      setShowTopBtn(el.scrollTop > 600);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Kata-perkata: per-ayat lazy fetched + cached in memory.
  interface KataItem {
    posisi: number;
    arab: string;
    transliterasi: string | null;
    arti: string;
  }
  const [kataCache, setKataCache] = useState<Record<number, KataItem[]>>({});
  const [openKata, setOpenKata] = useState<Set<number>>(new Set());
  async function toggleKata(ayatId: number) {
    setOpenKata((prev) => {
      const next = new Set(prev);
      if (next.has(ayatId)) next.delete(ayatId);
      else next.add(ayatId);
      return next;
    });
    if (!kataCache[ayatId]) {
      try {
        const res = await fetcher<{ kata: KataItem[]; available: boolean }>(
          `/quran/ayat/${ayatId}/kata`,
        );
        setKataCache((c) => ({ ...c, [ayatId]: res.kata }));
      } catch {
        setKataCache((c) => ({ ...c, [ayatId]: [] }));
      }
    }
  }

  // Reading session: log a single ayat-read event per surah view.
  // Throttle in localStorage so it fires once per day per surah.
  useEffect(() => {
    if (!user || !surah) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `rumahquran:read-${surah.nomor}-${today}`;
    if (typeof window !== "undefined" && !localStorage.getItem(key)) {
      void apiFetch("/me/reading-session", {
        method: "POST",
        body: JSON.stringify({ tanggal: today, ayatCount: surah.ayat.length }),
      }).catch(() => undefined);
      localStorage.setItem(key, "1");
    }
  }, [user, surah]);

  // Compose-note dialog state
  const [noteEditing, setNoteEditing] = useState<{
    ayatId: number;
    judul: string;
    body: string;
  } | null>(null);
  async function saveNote() {
    if (!noteEditing) return;
    if (!noteEditing.body.trim()) {
      setNoteEditing(null);
      return;
    }
    try {
      await apiFetch("/me/notes", {
        method: "POST",
        body: JSON.stringify({
          ayatId: noteEditing.ayatId,
          judul: noteEditing.judul.trim() || undefined,
          body: noteEditing.body.trim(),
        }),
      });
      await mutateNotes();
    } catch {
      /* ignore */
    }
    setNoteEditing(null);
  }
  async function deleteNote(id: string) {
    try {
      await apiFetch(`/me/notes/${id}`, { method: "DELETE" });
      await mutateNotes();
    } catch {
      /* ignore */
    }
  }

  const tafsirByAyat = useMemo(() => {
    const map = new Map<number, string>();
    tafsir?.tafsir?.forEach((t) => map.set(t.ayat, t.teks));
    return map;
  }, [tafsir]);

  const translationByAyat = useMemo(() => {
    const map = new Map<number, string>();
    extraTranslation?.ayat?.forEach((t) => map.set(t.nomorAyat, t.teks));
    return map;
  }, [extraTranslation]);

  const asbabByAyat = useMemo(() => {
    const map = new Map<number, string>();
    asbab?.entries?.forEach((e) => map.set(e.nomorAyat, e.teks));
    return map;
  }, [asbab]);
  const [openAsbab, setOpenAsbab] = useState<Set<number>>(new Set());
  function toggleAsbab(ayatNomor: number) {
    setOpenAsbab((prev) => {
      const next = new Set(prev);
      if (next.has(ayatNomor)) next.delete(ayatNomor);
      else next.add(ayatNomor);
      return next;
    });
  }

  // Reset which tafsir/asbab boxes are open whenever the user navigates to
  // a different surah. Without this, opening ayat 5's tafsir on surah 1
  // would carry over and look opened on surah 2's ayat 5 too (same client
  // component instance, just route params change in Next.js 16). Also
  // pause any audio that's still playing from the previous surah.
  useEffect(() => {
    setOpenTafsir(new Set());
    setOpenAsbab(new Set());
    setCurrentAyatId(null);
    setIsPlaying(false);
    audioRef.current?.pause();
  }, [nomor]);

  // Follow the recitation: when a new ayat loads into the player, gently
  // center it in the viewport so the reader's eye tracks the audio.
  useEffect(() => {
    if (!surah || currentAyatId === null) return;
    const a = surah.ayat.find((x) => x.id === currentAyatId);
    if (!a) return;
    const el = document.getElementById(`ayat-${a.nomorAyat}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentAyatId, surah]);

  const bookmarkByAyat = useMemo(() => {
    const map = new Map<number, string>();
    bookmarks?.forEach((b) => map.set(b.ayatId, b.id));
    return map;
  }, [bookmarks]);

  const memorizedAyat = useMemo(() => {
    const set = new Set<number>();
    hafalan?.forEach((h) => set.add(h.ayatId));
    return set;
  }, [hafalan]);

  // When user lands on /surat/X#ayat-Y (e.g. from a topic page link), the
  // anchored ayat exists only after SWR fetches `surah` and the AyatItem
  // components mount. Browser's native hash-scroll fires too early. Scroll
  // manually once we have the data + DOM. Smooth scroll + small delay so
  // it feels intentional, not jarring.
  useEffect(() => {
    if (!surah || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    // window.location.hash is "#ayat-5" so strip the leading "#".
    const id = hash.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, [surah]);

  async function memorize(ayatId: number) {
    if (!user || memorizedAyat.has(ayatId)) return;
    try {
      await apiFetch("/user/hafalan", {
        method: "POST",
        body: JSON.stringify({ ayatId }),
      });
      await mutateHafalan();
    } catch {
      /* already memorized or failed */
    }
  }

  /**
   * Build the streaming URL for the API's self-hosted audio proxy. The
   * backend (AudioController) lazily caches the file from equran's CDN on
   * first request, then serves from local disk afterwards.
   */
  function streamUrl(surahNomor: number, ayatNomor: number): string {
    return `${API_URL}/audio/stream/${qari}/ayat/${surahNomor}/${ayatNomor}`;
  }

  async function toggleBookmark(ayatId: number) {
    if (!user) return;
    const existing = bookmarkByAyat.get(ayatId);
    try {
      if (existing) {
        await apiFetch(`/user/bookmark/${existing}`, { method: "DELETE" });
      } else {
        await apiFetch("/user/bookmark", {
          method: "POST",
          body: JSON.stringify({ ayatId }),
        });
      }
      await mutateBookmarks();
    } catch {
      /* ignore */
    }
  }

  function toggleTafsir(ayatNomor: number) {
    setOpenTafsir((prev) => {
      const next = new Set(prev);
      if (next.has(ayatNomor)) next.delete(ayatNomor);
      else next.add(ayatNomor);
      return next;
    });
  }

  if (nomor === null) {
    return <ErrorBox message="Nomor surat tidak valid (harus 1-114)." />;
  }
  if (isLoading) return <Spinner label="Memuat surat…" />;
  if (error) return <ErrorBox message={error.message} />;
  if (!surah) return null;

  const n = nomor;
  const ayatList = surah.ayat;
  const playingIndex =
    currentAyatId !== null
      ? ayatList.findIndex((a) => a.id === currentAyatId)
      : -1;
  const playingAyat = playingIndex >= 0 ? ayatList[playingIndex] : null;

  function loadAndPlay(index: number) {
    const a = ayatList[index];
    const audio = audioRef.current;
    if (!a || !audio) return;
    audio.src = streamUrl(surah!.nomor, a.nomorAyat);
    setCurrentAyatId(a.id);
    void audio.play();
  }
  function togglePauseResume() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }
  function togglePlayAyat(ayat: { id: number }) {
    if (currentAyatId === ayat.id) {
      togglePauseResume();
      return;
    }
    loadAndPlay(ayatList.findIndex((a) => a.id === ayat.id));
  }
  function playFromStart() {
    if (currentAyatId !== null) {
      stopAudio();
      return;
    }
    loadAndPlay(0);
  }
  function stopAudio() {
    audioRef.current?.pause();
    setCurrentAyatId(null);
    setIsPlaying(false);
  }
  function playNext() {
    if (playingIndex >= 0 && playingIndex < ayatList.length - 1)
      loadAndPlay(playingIndex + 1);
  }
  function playPrev() {
    if (playingIndex > 0) loadAndPlay(playingIndex - 1);
  }
  function handleAudioEnded() {
    if (prefs.continuous && playingIndex >= 0 && playingIndex < ayatList.length - 1)
      loadAndPlay(playingIndex + 1);
    else stopAudio();
  }
  function jumpToAyat(nomorAyat: number) {
    document
      .getElementById(`ayat-${nomorAyat}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Reading-progress bar — pinned just under the sticky navbar (h-16). */}
      <div className="fixed left-0 right-0 top-16 z-30 h-1 bg-transparent pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-[width] duration-150"
          style={{ width: `${scrollPct}%` }}
        />
      </div>

      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleAudioEnded}
        className="hidden"
      />

      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Semua surat
      </Link>

      <header className="relative my-5 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white p-8 text-center shadow-lg">
        <div aria-hidden className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="absolute -left-8 -bottom-12 w-56 h-56 rounded-full bg-emerald-900/20 blur-3xl" />
        <div className="relative">
          <span className="inline-grid h-9 w-9 place-items-center rounded-full bg-white/15 text-sm font-bold mb-3 ring-1 ring-white/25">
            {surah.nomor}
          </span>
          <p className="arabic arabic-display mb-2">{surah.nama}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            {surah.namaLatin}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium">
              {surah.arti}
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium">
              {surah.jumlahAyat} ayat
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1 font-medium capitalize">
              {surah.tempatTurun}
            </span>
          </div>
          {surah.deskripsi && (
            <button
              onClick={() => setShowAbout((v) => !v)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-3.5 py-1.5 text-xs font-semibold transition"
            >
              <Info size={13} />
              {showAbout ? "Sembunyikan info surat" : "Tentang surat ini"}
              <ChevronDown
                size={13}
                className={`transition-transform ${showAbout ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      </header>

      {showAbout && surah.deskripsi && (
        <div className="card fade-in-up p-5 mb-5">
          <p className="section-eyebrow mb-2">Tentang Surat {surah.namaLatin}</p>
          <div
            className="text-[14.5px] leading-relaxed text-slate-700 [&_a]:text-emerald-700 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: surah.deskripsi }}
          />
        </div>
      )}

      <div className="card p-3 sm:p-4 mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={playFromStart}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3.5 py-2 text-sm font-semibold hover:bg-emerald-700 shadow-sm transition"
          >
            {currentAyatId !== null ? (
              <>
                <Pause size={15} fill="currentColor" /> Hentikan
              </>
            ) : (
              <>
                <Play size={15} fill="currentColor" /> Putar surat
              </>
            )}
          </button>

          <label className="flex items-center gap-2 text-sm flex-1 min-w-[160px]">
            <span className="text-slate-500 font-medium shrink-0">Qari</span>
            <select
              value={qari}
              onChange={(e) => setQari(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              {(qariList ?? [{ id: "05", nama: "Mishary Rashid Al-Afasy" }]).map(
                (q) => (
                  <option key={q.id} value={q.id}>
                    {q.nama}
                  </option>
                ),
              )}
            </select>
          </label>

          <button
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              showSettings
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
            }`}
          >
            <Sliders size={15} />
            <span className="hidden sm:inline">Tampilan</span>
            <ChevronDown
              size={13}
              className={`transition-transform ${showSettings ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {showSettings && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-4 fade-in-up">
            {/* Arabic font size */}
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <Type size={15} /> Ukuran teks Arab
              </span>
              <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
                <button
                  onClick={() =>
                    setPref(
                      "arabicScale",
                      Math.max(0.8, +(prefs.arabicScale - 0.1).toFixed(2)),
                    )
                  }
                  disabled={prefs.arabicScale <= 0.8}
                  className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  aria-label="Perkecil teks Arab"
                >
                  <Minus size={15} />
                </button>
                <span className="w-12 text-center text-sm font-semibold tabular-nums text-slate-700">
                  {Math.round(prefs.arabicScale * 100)}%
                </span>
                <button
                  onClick={() =>
                    setPref(
                      "arabicScale",
                      Math.min(1.8, +(prefs.arabicScale + 0.1).toFixed(2)),
                    )
                  }
                  disabled={prefs.arabicScale >= 1.8}
                  className="grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                  aria-label="Perbesar teks Arab"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* Layer toggles */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["showLatin", "Latin"],
                  ["showTranslation", "Terjemahan"],
                  ["continuous", "Putar berurutan"],
                ] as const
              ).map(([key, label]) => {
                const on = prefs[key];
                return (
                  <button
                    key={key}
                    onClick={() => setPref(key, !on)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      on
                        ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {key === "continuous" && <Repeat size={12} />}
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Source + navigation selects */}
            <div className="grid sm:grid-cols-3 gap-2.5 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Tafsir</span>
                <select
                  value={tafsirSumber}
                  onChange={(e) => setTafsirSumber(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                >
                  {(tafsirSources ?? [
                    { sumber: "kemenag", nama: "Kemenag", bahasa: "id" },
                  ]).map((s) => (
                    <option key={s.sumber} value={s.sumber}>
                      {s.nama}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">
                  Terjemahan tambahan
                </span>
                <select
                  value={translationSumber}
                  onChange={(e) => setTranslationSumber(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">— tidak ada —</option>
                  {(translationSources ?? []).map((s) => (
                    <option key={s.sumber} value={s.sumber}>
                      {s.penerjemah}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">
                  Lompat ke ayat
                </span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) jumpToAyat(Number(e.target.value));
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">Pilih ayat…</option>
                  {ayatList.map((a) => (
                    <option key={a.nomorAyat} value={a.nomorAyat}>
                      Ayat {a.nomorAyat}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      <div
        className="space-y-3"
        style={{ ["--arabic-scale" as string]: prefs.arabicScale }}
      >
        {surah.ayat.map((ayat) => (
          <AyatItem
            key={ayat.id}
            ayat={{ ...ayat, surah: { nomor: surah.nomor, namaLatin: surah.namaLatin } }}
            playing={currentAyatId === ayat.id && isPlaying}
            onTogglePlay={() => togglePlayAyat(ayat)}
            showLatin={prefs.showLatin}
            showTranslation={prefs.showTranslation}
            tafsirText={tafsirByAyat.get(ayat.nomorAyat)}
            showTafsir={openTafsir.has(ayat.nomorAyat)}
            onToggleTafsir={() => toggleTafsir(ayat.nomorAyat)}
            bookmarked={bookmarkByAyat.has(ayat.id)}
            onToggleBookmark={() => toggleBookmark(ayat.id)}
            memorized={memorizedAyat.has(ayat.id)}
            onMemorize={() => memorize(ayat.id)}
            loggedIn={!!user}
            extraTranslation={translationByAyat.get(ayat.nomorAyat)}
            asbabText={asbabByAyat.get(ayat.nomorAyat)}
            showAsbab={openAsbab.has(ayat.nomorAyat)}
            onToggleAsbab={() => toggleAsbab(ayat.nomorAyat)}
            kata={kataCache[ayat.id]}
            showKata={openKata.has(ayat.id)}
            onToggleKata={() => void toggleKata(ayat.id)}
            notes={notesByAyat.get(ayat.id)}
            onAddNote={() =>
              setNoteEditing({ ayatId: ayat.id, judul: "", body: "" })
            }
            onDeleteNote={(id) => void deleteNote(id)}
          />
        ))}
      </div>

      <nav className="flex justify-between gap-3 mt-8 text-sm">
        {n > 1 ? (
          <Link
            href={`/surat/${n - 1}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 shadow-sm transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Surat {n - 1}
          </Link>
        ) : (
          <span />
        )}
        {n < 114 && (
          <Link
            href={`/surat/${n + 1}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 shadow-sm transition"
          >
            Surat {n + 1}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
      </nav>

      {/* Keep the bottom nav buttons clear of the fixed mini-player. */}
      {playingAyat && <div aria-hidden className="h-20" />}

      {/* Back to top */}
      {showTopBtn && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Kembali ke atas"
          className={`fixed right-4 z-30 grid h-11 w-11 place-items-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition ${
            playingAyat ? "bottom-[140px] sm:bottom-24" : "bottom-[84px] sm:bottom-6"
          }`}
        >
          <ArrowUp size={20} />
        </button>
      )}

      {/* Sticky now-playing mini-player */}
      {playingAyat && (
        <div className="fixed inset-x-0 bottom-[68px] sm:bottom-0 z-30 border-t border-emerald-100 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(15,29,24,0.08)]">
          <div className="mx-auto max-w-3xl px-4 py-2.5 flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                Sedang diputar
              </p>
              <p className="text-sm font-semibold text-slate-800 truncate">
                {surah.namaLatin} · Ayat {playingAyat.nomorAyat}
                <span className="font-normal text-slate-400">
                  {" "}
                  / {surah.jumlahAyat}
                </span>
              </p>
            </div>
            <button
              onClick={() => setPref("continuous", !prefs.continuous)}
              title="Putar berurutan otomatis"
              aria-pressed={prefs.continuous}
              className={`hidden min-[400px]:grid h-9 w-9 place-items-center rounded-full transition ${
                prefs.continuous
                  ? "bg-emerald-100 text-emerald-700"
                  : "text-slate-400 hover:bg-slate-100"
              }`}
            >
              <Repeat size={16} />
            </button>
            <button
              onClick={playPrev}
              disabled={playingIndex <= 0}
              title="Ayat sebelumnya"
              className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            >
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button
              onClick={togglePauseResume}
              title={isPlaying ? "Jeda" : "Putar"}
              className="grid h-11 w-11 place-items-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition"
            >
              {isPlaying ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
            </button>
            <button
              onClick={playNext}
              disabled={playingIndex >= ayatList.length - 1}
              title="Ayat berikutnya"
              className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            >
              <SkipForward size={18} fill="currentColor" />
            </button>
            <button
              onClick={stopAudio}
              title="Tutup pemutar"
              className="grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {noteEditing && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm grid place-items-center px-4">
          <div className="card max-w-lg w-full p-6 space-y-3 bg-white">
            <h3 className="text-lg font-semibold text-slate-900">
              Catatan untuk ayat
            </h3>
            <input
              value={noteEditing.judul}
              onChange={(e) =>
                setNoteEditing(
                  noteEditing ? { ...noteEditing, judul: e.target.value } : null,
                )
              }
              placeholder="Judul (opsional)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <textarea
              value={noteEditing.body}
              onChange={(e) =>
                setNoteEditing(
                  noteEditing ? { ...noteEditing, body: e.target.value } : null,
                )
              }
              placeholder="Tulis catatanmu di sini…"
              rows={6}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setNoteEditing(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                onClick={() => void saveNote()}
                disabled={!noteEditing.body.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
