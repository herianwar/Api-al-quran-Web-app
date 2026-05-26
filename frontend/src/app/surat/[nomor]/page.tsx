"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  Bookmark,
  Hafalan,
  Qari,
  SurahDetail,
  TafsirSurah,
} from "@/lib/types";
import { AyatItem } from "@/components/AyatItem";
import { ErrorBox, Spinner } from "@/components/Spinner";

export default function SuratPage() {
  const params = useParams<{ nomor: string }>();
  const nomor = params.nomor;
  const { user } = useAuth();

  const { data: surah, error, isLoading } = useSWR<SurahDetail>(
    `/quran/surat/${nomor}`,
    fetcher,
  );
  const { data: qariList } = useSWR<Qari[]>("/audio/qari", fetcher);
  const { data: tafsir } = useSWR<TafsirSurah>(`/tafsir/${nomor}`, fetcher, {
    shouldRetryOnError: false,
  });
  const { data: bookmarks, mutate: mutateBookmarks } = useSWR<Bookmark[]>(
    user ? "/user/bookmark" : null,
    fetcher,
  );
  const { data: hafalan, mutate: mutateHafalan } = useSWR<Hafalan[]>(
    user ? "/user/hafalan" : null,
    fetcher,
  );

  const [qari, setQari] = useState("05");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [openTafsir, setOpenTafsir] = useState<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tafsirByAyat = useMemo(() => {
    const map = new Map<number, string>();
    tafsir?.tafsir?.forEach((t) => map.set(t.ayat, t.teks));
    return map;
  }, [tafsir]);

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

  function playUrl(url: string | undefined, id: number) {
    if (!url) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = url;
    void audio.play();
    setPlayingId(id);
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

  if (isLoading) return <Spinner label="Memuat surat…" />;
  if (error) return <ErrorBox message={error.message} />;
  if (!surah) return null;

  const n = Number(nomor);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        className="hidden"
      />

      <Link href="/" className="text-sm text-emerald-700 hover:underline">
        ← Semua surat
      </Link>

      <header className="my-4 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6 text-center">
        <p className="arabic text-3xl mb-1">{surah.nama}</p>
        <h1 className="text-xl font-bold">{surah.namaLatin}</h1>
        <p className="text-emerald-50/90 text-sm">
          {surah.arti} · {surah.jumlahAyat} ayat · {surah.tempatTurun}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <label className="text-sm flex items-center gap-2">
          <span className="text-emerald-900/60">Qari:</span>
          <select
            value={qari}
            onChange={(e) => setQari(e.target.value)}
            className="rounded-lg border border-emerald-900/15 bg-white/70 px-2 py-1.5 text-sm"
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
          onClick={() => playUrl(surah.audioFullUrl?.[qari], -1)}
          className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700"
        >
          {playingId === -1 ? "⏸ Jeda surat" : "▶ Putar 1 surat"}
        </button>
      </div>

      <div className="space-y-3">
        {surah.ayat.map((ayat) => (
          <AyatItem
            key={ayat.id}
            ayat={{ ...ayat, surah: { nomor: surah.nomor, namaLatin: surah.namaLatin } }}
            playing={playingId === ayat.id}
            onTogglePlay={() => playUrl(ayat.audioUrls?.[qari], ayat.id)}
            tafsirText={tafsirByAyat.get(ayat.nomorAyat)}
            showTafsir={openTafsir.has(ayat.nomorAyat)}
            onToggleTafsir={() => toggleTafsir(ayat.nomorAyat)}
            bookmarked={bookmarkByAyat.has(ayat.id)}
            onToggleBookmark={() => toggleBookmark(ayat.id)}
            memorized={memorizedAyat.has(ayat.id)}
            onMemorize={() => memorize(ayat.id)}
            loggedIn={!!user}
          />
        ))}
      </div>

      <nav className="flex justify-between mt-8 text-sm">
        {n > 1 ? (
          <Link
            href={`/surat/${n - 1}`}
            className="rounded-lg border border-emerald-600/30 px-4 py-2 hover:bg-emerald-600/10"
          >
            ← Surat {n - 1}
          </Link>
        ) : (
          <span />
        )}
        {n < 114 && (
          <Link
            href={`/surat/${n + 1}`}
            className="rounded-lg border border-emerald-600/30 px-4 py-2 hover:bg-emerald-600/10"
          >
            Surat {n + 1} →
          </Link>
        )}
      </nav>
    </div>
  );
}
