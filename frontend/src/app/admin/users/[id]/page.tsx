"use client";

import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  Brain,
  Calendar,
  Mail,
  Shield,
  Smartphone,
  Trash2,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { SectionHeader } from "@/components/admin/PageHeader";

interface UserDetail {
  id: string;
  email: string;
  nama: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  readingProgress: { surahId: number; ayatId: number; updatedAt: string } | null;
  bookmarks: {
    id: string;
    createdAt: string;
    ayat: {
      nomorAyat: number;
      teksIndonesia: string;
      surah: { nomor: number; namaLatin: string };
    };
  }[];
  hafalan: {
    id: string;
    level: number;
    nextReviewAt: string;
    lastReviewAt: string | null;
    ayat: { nomorAyat: number; surah: { nomor: number; namaLatin: string } };
  }[];
  deviceTokens: {
    id: string;
    platform: string;
    deviceName: string | null;
    lastSeenAt: string;
    createdAt: string;
  }[];
}

/** Small count chip for section headers. `capped` shows "50+" when the
 *  backend's take:50 limit is hit (we can't know the true total past it). */
function CountBadge({ n, capped }: { n: number; capped?: boolean }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
      {capped && n >= 50 ? "50+" : n}
    </span>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { user: me } = useAuth();
  const { data: user, error, isLoading, mutate } = useSWR<UserDetail>(
    id ? `/admin/users/${id}` : null,
    fetcher,
  );
  const [busy, setBusy] = useState(false);
  const isSelf = !!user && user.id === me?.id;

  async function toggleRole() {
    if (!user || busy || isSelf) return;
    const next = user.role === "admin" ? "user" : "admin";
    if (!confirm(`Ubah role ${user.email} jadi ${next}?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${user.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: next }),
      });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!user || busy || isSelf) return;
    if (!confirm(`HAPUS ${user.email}? Semua data terkait ikut hilang.`))
      return;
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${user.id}`, { method: "DELETE" });
      router.push("/admin/users");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal");
      setBusy(false);
    }
  }

  if (isLoading) return <Spinner label="Memuat user…" />;
  if (error) return <ErrorBox message={error.message} />;
  if (!user) return null;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        <ArrowLeft size={14} /> Daftar user
      </Link>

      {/* Profile header */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 sm:h-16 sm:w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xl sm:text-2xl font-bold shadow-sm">
            {(user.nama ?? user.email)[0]?.toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">
                {user.nama ?? "(tanpa nama)"}
              </h1>
              <span
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                  user.role === "admin"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                <Shield size={10} /> {user.role}
              </span>
              {isSelf && (
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-500">
                  Akun Anda
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 flex items-start gap-1.5 mt-1.5 break-all">
              <Mail size={14} className="text-slate-400 mt-0.5 shrink-0" />{" "}
              {user.email}
            </p>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
              <Calendar size={12} className="text-slate-400 shrink-0" /> Bergabung{" "}
              {new Date(user.createdAt).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Actions — full-width row underneath so they never crowd the header
            on mobile. Hidden entirely when you're viewing your own account. */}
        {!isSelf && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:justify-end gap-2">
            <button
              onClick={toggleRole}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
            >
              <UserCheck size={14} />
              {user.role === "admin" ? "Demote ke user" : "Promote ke admin"}
            </button>
            <button
              onClick={deleteUser}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Hapus
            </button>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <BookmarkIcon size={20} className="mx-auto text-amber-500 mb-1" />
          <p className="text-2xl font-bold text-slate-900">
            {user.bookmarks.length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Bookmark</p>
        </div>
        <div className="card p-4 text-center">
          <Brain size={20} className="mx-auto text-emerald-600 mb-1" />
          <p className="text-2xl font-bold text-slate-900">
            {user.hafalan.length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Hafalan</p>
        </div>
        <div className="card p-4 text-center">
          <Smartphone size={20} className="mx-auto text-sky-600 mb-1" />
          <p className="text-2xl font-bold text-slate-900">
            {user.deviceTokens.length}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Device</p>
        </div>
      </div>

      {/* Devices */}
      <section>
        <SectionHeader
          title="Device terdaftar"
          action={<CountBadge n={user.deviceTokens.length} />}
        />
        {user.deviceTokens.length === 0 ? (
          <div className="card p-5 text-sm text-slate-500 text-center">
            Belum ada device terdaftar.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Platform</th>
                  <th className="px-4 py-2 text-left">Nama</th>
                  <th className="px-4 py-2 text-left">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {user.deviceTokens.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-semibold">{d.platform}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {d.deviceName ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(d.lastSeenAt).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </section>

      {/* Bookmarks */}
      <section>
        <SectionHeader
          title="Bookmark"
          description={
            user.bookmarks.length > 10
              ? "10 terbaru ditampilkan"
              : undefined
          }
          action={<CountBadge n={user.bookmarks.length} capped />}
        />
        {user.bookmarks.length === 0 ? (
          <div className="card p-5 text-sm text-slate-500 text-center">
            Belum ada bookmark.
          </div>
        ) : (
          <div className="space-y-2">
            {user.bookmarks.slice(0, 10).map((b) => (
              <Link
                key={b.id}
                href={`/surat/${b.ayat.surah.nomor}#ayat-${b.ayat.nomorAyat}`}
                target="_blank"
                className="card card-hover p-3 flex items-center gap-3"
              >
                <span className="shrink-0 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                  {b.ayat.surah.namaLatin} {b.ayat.surah.nomor}:
                  {b.ayat.nomorAyat}
                </span>
                <p className="flex-1 text-sm text-slate-700 truncate">
                  {b.ayat.teksIndonesia}
                </p>
              </Link>
            ))}
            {user.bookmarks.length > 10 && (
              <p className="text-xs text-slate-500 text-center pt-2">
                + {user.bookmarks.length - 10} bookmark lainnya
              </p>
            )}
          </div>
        )}
      </section>

      {/* Hafalan */}
      <section>
        <SectionHeader
          title="Hafalan"
          action={<CountBadge n={user.hafalan.length} capped />}
        />
        {user.hafalan.length === 0 ? (
          <div className="card p-5 text-sm text-slate-500 text-center">
            Belum ada ayat dihafal.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {user.hafalan.map((h) => (
              <Link
                key={h.id}
                href={`/surat/${h.ayat.surah.nomor}#ayat-${h.ayat.nomorAyat}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-emerald-500"
              >
                {h.ayat.surah.namaLatin} {h.ayat.nomorAyat}
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
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
