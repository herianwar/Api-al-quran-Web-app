"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import type { Ayat, SurahListItem } from "@/lib/types";
import { SurahCard } from "@/components/SurahCard";
import { ErrorBox, Spinner } from "@/components/Spinner";

function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function HomePage() {
  const [mode, setMode] = useState<"surat" | "ayat">("surat");
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim());

  const { data: surahs, error, isLoading } = useSWR<SurahListItem[]>(
    "/quran/surat",
    fetcher,
  );

  const { data: ayatResults, isLoading: searching } = useSWR<Ayat[]>(
    mode === "ayat" && debounced.length >= 2
      ? `/quran/search?q=${encodeURIComponent(debounced)}&lang=id&limit=30`
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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-8 sm:p-10 mb-8 shadow-lg">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">
          Al-Qur&apos;an Super App
        </h1>
        <p className="text-emerald-50/90 max-w-xl">
          Baca 114 surat, dengarkan murottal, baca tafsir Kemenag, doa &amp;
          dzikir, dan jadwal sholat — dalam satu tempat.
        </p>
      </section>

      <div className="mb-5 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="inline-flex rounded-xl border border-emerald-900/10 p-1 bg-white/60 self-start">
          {(["surat", "ayat"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition ${
                mode === m ? "bg-emerald-600 text-white" : "text-emerald-900/70"
              }`}
            >
              {m === "surat" ? "Cari Surat" : "Cari Ayat"}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            mode === "surat"
              ? "Cari nama surat (mis. Al-Baqarah)…"
              : "Cari kata dalam terjemah (mis. sabar)…"
          }
          className="flex-1 rounded-xl border border-emerald-900/15 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      {error && <ErrorBox message={`Gagal memuat data: ${error.message}`} />}

      {mode === "ayat" ? (
        <section>
          {debounced.length < 2 ? (
            <p className="text-sm text-emerald-900/50 py-8 text-center">
              Ketik minimal 2 huruf untuk mencari ayat.
            </p>
          ) : searching ? (
            <Spinner label="Mencari ayat…" />
          ) : !ayatResults || ayatResults.length === 0 ? (
            <p className="text-sm text-emerald-900/50 py-8 text-center">
              Tidak ada hasil untuk &quot;{debounced}&quot;.
            </p>
          ) : (
            <div className="space-y-3">
              {ayatResults.map((a) => (
                <Link
                  key={a.id}
                  href={`/surat/${a.surah?.nomor}`}
                  className="block rounded-xl border border-emerald-900/10 bg-white/60 p-4 hover:border-emerald-500 transition"
                >
                  <span className="text-xs font-semibold text-emerald-700">
                    {a.surah?.namaLatin} : {a.nomorAyat}
                  </span>
                  <p className="arabic text-xl text-right my-2">{a.teksArab}</p>
                  <p className="text-sm text-emerald-950/75">{a.teksIndonesia}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : isLoading ? (
        <Spinner label="Memuat daftar surat…" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <SurahCard key={s.nomor} surah={s} />
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-emerald-900/50 col-span-full py-8 text-center">
              Surat tidak ditemukan. Pastikan data sudah di-seed di backend.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
