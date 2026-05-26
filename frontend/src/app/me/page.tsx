"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Bookmark, Hafalan } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

export default function MePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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
      <section className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{user.nama ?? "Pengguna"}</h1>
          <p className="text-emerald-50/90 text-sm">{user.email}</p>
        </div>
        <button
          onClick={() => logout().then(() => router.push("/"))}
          className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25"
        >
          Keluar
        </button>
      </section>

      <section>
        <h2 className="font-bold text-lg mb-3">
          Muraja&apos;ah hari ini{" "}
          <span className="text-sm font-normal text-emerald-900/50">
            ({review?.length ?? 0})
          </span>
        </h2>
        {!review || review.length === 0 ? (
          <p className="text-sm text-emerald-900/50">
            Tidak ada hafalan yang perlu diulang hari ini. 🎉
          </p>
        ) : (
          <div className="space-y-3">
            {review.map((h) => (
              <div
                key={h.id}
                className="rounded-2xl border border-emerald-900/10 bg-white/60 p-4"
              >
                <p className="text-xs font-semibold text-emerald-700 mb-1">
                  {h.ayat?.surah?.namaLatin} : {h.ayat?.nomorAyat} · Level{" "}
                  {h.level}
                </p>
                <p className="arabic text-2xl text-right mb-3">
                  {h.ayat?.teksArab}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => doReview(h.id, true)}
                    className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700"
                  >
                    ✓ Ingat
                  </button>
                  <button
                    onClick={() => doReview(h.id, false)}
                    className="flex-1 rounded-lg border border-emerald-600/30 py-2 text-sm font-medium hover:bg-emerald-600/10"
                  >
                    ✗ Lupa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-bold text-lg mb-3">
          Bookmark{" "}
          <span className="text-sm font-normal text-emerald-900/50">
            ({bookmarks?.length ?? 0})
          </span>
        </h2>
        {!bookmarks || bookmarks.length === 0 ? (
          <p className="text-sm text-emerald-900/50">
            Belum ada bookmark. Tandai ayat favorit dengan ikon ☆ saat membaca.
          </p>
        ) : (
          <div className="space-y-3">
            {bookmarks.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl border border-emerald-900/10 bg-white/60 p-4"
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={`/surat/${b.ayat?.surah?.nomor}`}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    {b.ayat?.surah?.namaLatin} : {b.ayat?.nomorAyat}
                  </Link>
                  <button
                    onClick={() => removeBookmark(b.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Hapus
                  </button>
                </div>
                <p className="arabic text-xl text-right my-2">
                  {b.ayat?.teksArab}
                </p>
                <p className="text-sm text-emerald-950/75">
                  {b.ayat?.teksIndonesia}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-bold text-lg mb-3">
          Semua hafalan{" "}
          <span className="text-sm font-normal text-emerald-900/50">
            ({hafalan?.length ?? 0})
          </span>
        </h2>
        {!hafalan || hafalan.length === 0 ? (
          <p className="text-sm text-emerald-900/50">
            Belum ada ayat yang ditandai untuk dihafal.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hafalan.map((h) => (
              <Link
                key={h.id}
                href={`/surat/${h.ayat?.surah?.nomor}`}
                className="rounded-lg border border-emerald-900/10 bg-white/60 px-3 py-1.5 text-sm hover:border-emerald-500"
              >
                {h.ayat?.surah?.namaLatin}:{h.ayat?.nomorAyat}{" "}
                <span className="text-emerald-700/60">L{h.level}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
