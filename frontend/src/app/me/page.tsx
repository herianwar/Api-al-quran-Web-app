"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Bookmark, Hafalan } from "@/lib/types";
import { Spinner } from "@/components/Spinner";
import { StreakCard } from "@/components/StreakCard";

export default function MePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.push("/");
    } finally {
      setLoggingOut(false);
    }
  }

  const { data: bookmarks, mutate: mutateBookmarks } = useSWR<Bookmark[]>(
    user ? "/user/bookmark" : null,
    fetcher,
  );
  const { data: hafalan, mutate: mutateHafalan } = useSWR<Hafalan[]>(
    user ? "/user/hafalan" : null,
    fetcher,
  );
  const { data: review, mutate: mutateReview } = useSWR<Hafalan[]>(
    user ? "/user/hafalan/review" : null,
    fetcher,
  );

  if (loading || !user) return <Spinner label="Memuat…" />;

  async function removeBookmark(id: string) {
    await apiFetch(`/user/bookmark/${id}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    await mutateBookmarks();
  }

  async function doReview(id: string, remembered: boolean) {
    await apiFetch(`/user/hafalan/${id}/review`, {
      method: "PUT",
      body: JSON.stringify({ remembered }),
    }).catch(() => undefined);
    await Promise.all([mutateReview(), mutateHafalan()]);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white p-6 sm:p-7 shadow-lg">
        <div aria-hidden className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">
              {user.nama ?? "Pengguna"}
            </h1>
            <p className="text-emerald-50 text-sm mt-1 truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="shrink-0 rounded-lg bg-white/20 backdrop-blur-sm px-4 py-2 text-sm font-semibold hover:bg-white/30 disabled:opacity-50 transition"
          >
            {loggingOut ? "Keluar…" : "Keluar"}
          </button>
        </div>
      </section>

      <StreakCard />

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-bold text-xl text-slate-900">
            Muraja&apos;ah hari ini
          </h2>
          <span className="text-sm font-medium text-slate-500">
            {review?.length ?? 0} ayat
          </span>
        </div>
        {!review || review.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-600">
            Tidak ada hafalan yang perlu diulang hari ini.
            <br />
            <span className="text-emerald-700 font-medium">
              Pertahankan!
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {review.map((h) => (
              <div key={h.id} className="card p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">
                  {h.ayat?.surah?.namaLatin} {h.ayat?.surah?.nomor}:
                  {h.ayat?.nomorAyat} · Level {h.level}
                </p>
                <p className="arabic arabic-body text-right text-slate-900 mb-4">
                  {h.ayat?.teksArab}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => doReview(h.id, true)}
                    className="flex-1 rounded-lg bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700 shadow-sm transition"
                  >
                    Ingat
                  </button>
                  <button
                    onClick={() => doReview(h.id, false)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Lupa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-bold text-xl text-slate-900">Bookmark</h2>
          <span className="text-sm font-medium text-slate-500">
            {bookmarks?.length ?? 0} ayat
          </span>
        </div>
        {!bookmarks || bookmarks.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-600">
            Belum ada bookmark. Tandai ayat favorit dengan ikon bookmark saat
            membaca.
          </div>
        ) : (
          <div className="space-y-3">
            {bookmarks.map((b) => (
              <div key={b.id} className="card p-5">
                <div className="flex items-center justify-between mb-2">
                  <Link
                    href={`/surat/${b.ayat?.surah?.nomor}#ayat-${b.ayat?.nomorAyat}`}
                    className="text-xs font-bold uppercase tracking-wider text-emerald-700 hover:underline"
                  >
                    {b.ayat?.surah?.namaLatin} {b.ayat?.surah?.nomor}:
                    {b.ayat?.nomorAyat}
                  </Link>
                  <button
                    onClick={() => removeBookmark(b.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                  >
                    Hapus
                  </button>
                </div>
                <p className="arabic arabic-body text-right text-slate-900 my-3">
                  {b.ayat?.teksArab}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {b.ayat?.teksIndonesia}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-bold text-xl text-slate-900">Semua hafalan</h2>
          <span className="text-sm font-medium text-slate-500">
            {hafalan?.length ?? 0} ayat
          </span>
        </div>
        {!hafalan || hafalan.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-600">
            Belum ada ayat yang ditandai untuk dihafal.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hafalan.map((h) => (
              <Link
                key={h.id}
                href={`/surat/${h.ayat?.surah?.nomor}#ayat-${h.ayat?.nomorAyat}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition"
              >
                {h.ayat?.surah?.namaLatin} {h.ayat?.nomorAyat}
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  L{h.level}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
