"use client";

import { BookMarked, ExternalLink, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { ErrorBox, Spinner } from "@/components/Spinner";
import { Button } from "@/components/admin/Button";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";

interface AyatSajdah {
  id: number;
  nomorAyat: number;
  teksArab: string;
  teksIndonesia: string;
  sajdah: string;
  surah: { nomor: number; namaLatin: string };
}

const JENIS = [
  { value: "wajibah", label: "Wajibah", color: "bg-emerald-100 text-emerald-700" },
  { value: "mukhtalaf", label: "Mukhtalaf", color: "bg-amber-100 text-amber-700" },
] as const;

export default function AdminSajdahPage() {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ surahNomor: "", nomorAyat: "", jenis: "wajibah" });

  const { data, error, isLoading, mutate } = useSWR<AyatSajdah[]>(
    "/admin/content/sajdah",
    fetcher,
  );

  async function changeJenis(
    surahNomor: number,
    nomorAyat: number,
    jenis: string,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/admin/content/sajdah", {
        method: "PUT",
        body: JSON.stringify({ surahNomor, nomorAyat, jenis }),
      });
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal update");
    } finally {
      setBusy(false);
    }
  }

  async function addNew(e: React.FormEvent) {
    e.preventDefault();
    const s = parseInt(form.surahNomor, 10);
    const a = parseInt(form.nomorAyat, 10);
    if (!s || !a) return;
    await changeJenis(s, a, form.jenis);
    setForm({ surahNomor: "", nomorAyat: "", jenis: "wajibah" });
    setAdding(false);
  }

  if (isLoading && !data) return <Spinner label="Memuat…" />;
  if (error) return <ErrorBox message={(error as Error).message} />;

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ayat Sajdah"
        description="Tag sajdah pada ayat tertentu (15 ayat standar). Admin dapat menambah/menghapus/mengubah jenis (wajibah/mukhtalaf)."
        action={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setAdding(true)}
          >
            Tambah ayat sajdah
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Belum ada ayat ter-tag sajdah"
          description="Klik 'Tambah ayat sajdah' atau jalankan seed `sajdah`."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((a, idx) => (
            <li key={a.id} className="card p-4 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-600 font-bold text-xs shrink-0">
                    {idx + 1}
                  </span>
                  <Link
                    href={`/surat/${a.surah.nomor}#ayat-${a.nomorAyat}`}
                    target="_blank"
                    className="text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1"
                  >
                    Q.S. {a.surah.namaLatin} {a.surah.nomor}:{a.nomorAyat}
                    <ExternalLink size={11} />
                  </Link>
                </div>
                <div className="flex items-center gap-1.5">
                  {JENIS.map((j) => (
                    <button
                      key={j.value}
                      onClick={() =>
                        changeJenis(a.surah.nomor, a.nomorAyat, j.value)
                      }
                      disabled={busy}
                      className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full transition ${
                        a.sajdah === j.value
                          ? j.color
                          : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                      } disabled:opacity-50`}
                    >
                      {j.label}
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      confirm("Hapus tag sajdah dari ayat ini?") &&
                      changeJenis(a.surah.nomor, a.nomorAyat, "")
                    }
                    disabled={busy}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    title="Hapus tag sajdah"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </div>
              <p className="arabic text-base text-slate-700 line-clamp-1 text-right">
                {a.teksArab}
              </p>
              <p className="text-xs text-slate-500 line-clamp-2">
                {a.teksIndonesia}
              </p>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm grid place-items-center p-4">
          <form
            onSubmit={addNew}
            className="card w-full max-w-md p-6 space-y-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tambah ayat sajdah</h2>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Surah (1-114)
                </span>
                <input
                  required
                  type="number"
                  min={1}
                  max={114}
                  value={form.surahNomor}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, surahNomor: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  Ayat
                </span>
                <input
                  required
                  type="number"
                  min={1}
                  value={form.nomorAyat}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nomorAyat: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-semibold text-slate-700">
                Jenis
              </span>
              <select
                value={form.jenis}
                onChange={(e) =>
                  setForm((f) => ({ ...f, jenis: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {JENIS.map((j) => (
                  <option key={j.value} value={j.value}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAdding(false)}
              >
                Batal
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                Tambah
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
