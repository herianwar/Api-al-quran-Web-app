"use client";

import {
  ArrowLeft,
  ExternalLink,
  ListTree,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import type { SurahListItem } from "@/lib/types";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { SectionHeader } from "@/components/admin/PageHeader";

interface LinkedAyat {
  id: number;
  catatan: string | null;
  ayat: {
    id: number;
    nomorAyat: number;
    teksIndonesia: string;
    surah: { nomor: number; namaLatin: string };
  };
}

interface TopicDetail {
  id: number;
  slug: string;
  nama: string;
  deskripsi: string | null;
  urutan: number;
  ayatLinks: LinkedAyat[];
}

const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export default function AdminTopicDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const {
    data: topic,
    error,
    isLoading,
    mutate,
  } = useSWR<TopicDetail>(
    slug ? `/admin/content/topic/${slug}` : null,
    fetcher,
  );
  const { data: surahs } = useSWR<SurahListItem[]>("/quran/surat", fetcher);

  const [surahNomor, setSurahNomor] = useState(1);
  const [nomorAyat, setNomorAyat] = useState("");
  const [catatan, setCatatan] = useState("");
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState<LinkedAyat | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const selectedSurah = useMemo(
    () => surahs?.find((s) => s.nomor === surahNomor),
    [surahs, surahNomor],
  );

  async function addAyat(e: React.FormEvent) {
    e.preventDefault();
    if (!topic || adding) return;
    const ayatNum = Number(nomorAyat);
    if (!ayatNum || ayatNum < 1) {
      alert("Nomor ayat tidak valid");
      return;
    }
    setAdding(true);
    try {
      await apiFetch(`/admin/content/topic/${topic.id}/ayat`, {
        method: "POST",
        body: JSON.stringify({
          surahNomor,
          nomorAyat: ayatNum,
          catatan: catatan.trim() || null,
        }),
      });
      // Reset ayat + catatan but keep the surah for fast consecutive adds.
      setNomorAyat("");
      setCatatan("");
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menambah ayat");
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemove() {
    const link = toRemove;
    if (!link) return;
    setToRemove(null);
    setRemovingId(link.id);
    try {
      await apiFetch(`/admin/content/topic-ayat/${link.id}`, {
        method: "DELETE",
      });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setRemovingId(null);
    }
  }

  if (isLoading) return <Spinner label="Memuat topik…" />;
  if (error) return <ErrorBox message={error.message} />;
  if (!topic) return null;

  const links = topic.ayatLinks ?? [];

  return (
    <div className="space-y-5">
      <Link
        href="/admin/content/topic"
        className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        <ArrowLeft size={14} /> Semua topik
      </Link>

      {/* Topic header */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">
              {topic.nama}
            </h1>
            <p className="text-xs font-mono text-slate-500 mt-1">
              /{topic.slug} · urutan {topic.urutan}
            </p>
            {topic.deskripsi && (
              <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
                {topic.deskripsi}
              </p>
            )}
          </div>
          <Link
            href={`/topic/${topic.slug}`}
            target="_blank"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
          >
            <ExternalLink size={14} /> Buka di app
          </Link>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <ListTree size={15} /> {links.length} ayat terhubung
        </div>
      </div>

      {/* Add ayat */}
      <section>
        <SectionHeader title="Tambah ayat" />
        <form onSubmit={addAyat} className="card p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">
                Surah
              </span>
              <select
                value={surahNomor}
                onChange={(e) => {
                  setSurahNomor(Number(e.target.value));
                  setNomorAyat("");
                }}
                className={INPUT}
              >
                {surahs?.map((s) => (
                  <option key={s.nomor} value={s.nomor}>
                    {s.nomor}. {s.namaLatin} ({s.jumlahAyat} ayat)
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:w-32">
              <span className="block text-xs font-semibold text-slate-600 mb-1">
                Ayat
                {selectedSurah && (
                  <span className="font-normal text-slate-400">
                    {" "}
                    · 1–{selectedSurah.jumlahAyat}
                  </span>
                )}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={selectedSurah?.jumlahAyat}
                placeholder="153"
                value={nomorAyat}
                onChange={(e) => setNomorAyat(e.target.value)}
                required
                className={INPUT}
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">
              Catatan{" "}
              <span className="font-normal text-slate-400">· opsional</span>
            </span>
            <input
              placeholder="Kenapa ayat ini relevan dengan tema…"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              maxLength={2000}
              className={INPUT}
            />
          </label>
          <Button
            type="submit"
            icon={<Plus size={16} />}
            loading={adding}
            loadingText="Menambah…"
            disabled={!surahs}
          >
            Tambah ke topik
          </Button>
        </form>
      </section>

      {/* Linked ayat */}
      <section>
        <SectionHeader title="Ayat dalam topik" />
        {links.length === 0 ? (
          <EmptyState
            icon={ListTree}
            title="Belum ada ayat"
            description="Tambahkan ayat lewat form di atas agar muncul di halaman topik."
          />
        ) : (
          <div className="space-y-2">
            {links.map((link) => (
              <div
                key={link.id}
                className={`card p-4 ${
                  removingId === link.id ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/surat/${link.ayat.surah.nomor}#ayat-${link.ayat.nomorAyat}`}
                    target="_blank"
                    className="shrink-0 inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    {link.ayat.surah.namaLatin} {link.ayat.surah.nomor}:
                    {link.ayat.nomorAyat}
                  </Link>
                  <button
                    onClick={() => setToRemove(link)}
                    disabled={removingId === link.id}
                    aria-label="Hapus ayat dari topik"
                    title="Hapus dari topik"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                  {link.ayat.teksIndonesia}
                </p>
                {link.catatan && (
                  <p className="text-xs text-slate-500 mt-2 border-l-2 border-emerald-200 pl-2 italic">
                    {link.catatan}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!toRemove}
        title="Hapus ayat dari topik?"
        message={
          toRemove
            ? `${toRemove.ayat.surah.namaLatin} ${toRemove.ayat.surah.nomor}:${toRemove.ayat.nomorAyat} akan dilepas dari topik ini${
                toRemove.catatan ? " (catatan ikut terhapus)" : ""
              }.`
            : ""
        }
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
