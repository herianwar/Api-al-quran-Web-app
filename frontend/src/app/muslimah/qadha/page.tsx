"use client";

import { ArrowLeft, Check, Plus, Trash2, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcherFull, type ApiResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { QadhaPuasa } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

const SUMBER_LABEL: Record<string, string> = {
  haid: "Haid",
  nifas: "Nifas",
  safar: "Safar",
  sakit: "Sakit",
  lainnya: "Lainnya",
};

interface QadhaMeta {
  totalHutang: number;
  totalLunas: number;
  sisa: number;
}

export default function QadhaPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [sumber, setSumber] = useState("haid");
  const [jumlah, setJumlah] = useState(1);
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const { data, mutate } = useSWR<ApiResponse<QadhaPuasa[]>>(
    user ? "/muslimah/qadha" : null,
    fetcherFull,
  );

  if (loading || !user) return <Spinner label="Memuat…" />;

  const items = data?.data ?? [];
  const meta = (data?.meta ?? {
    totalHutang: 0,
    totalLunas: 0,
    sisa: 0,
  }) as unknown as QadhaMeta;

  async function tambah(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch("/muslimah/qadha", {
        method: "POST",
        body: JSON.stringify({ sumber, jumlah, catatan: catatan || undefined }),
      });
      setJumlah(1);
      setCatatan("");
      await mutate();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function bayar(id: string) {
    await apiFetch(`/muslimah/qadha/${id}/bayar`, {
      method: "POST",
      body: JSON.stringify({ jumlah: 1 }),
    }).catch(() => undefined);
    await mutate();
  }

  async function hapus(id: string) {
    if (!confirm("Hapus entri qadha ini?")) return;
    await apiFetch(`/muslimah/qadha/${id}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    await mutate();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/muslimah"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-600"
        >
          <ArrowLeft size={15} /> Muslimah
        </Link>
      </div>

      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 grid place-items-center">
          <Utensils size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Utang Qadha Puasa</h1>
          <p className="text-sm text-slate-500">
            Lacak & lunasi puasa Ramadhan yang tertinggal.
          </p>
        </div>
      </header>

      {/* Ringkasan */}
      <section className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-xs text-slate-500">Total</p>
          <p className="text-2xl font-bold text-slate-900">{meta.totalHutang}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-slate-500">Lunas</p>
          <p className="text-2xl font-bold text-emerald-600">{meta.totalLunas}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-slate-500">Sisa</p>
          <p className="text-2xl font-bold text-rose-600">{meta.sisa}</p>
        </div>
      </section>

      {/* Form */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Plus size={16} /> Tambah hutang
        </h2>
        <form onSubmit={tambah} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-slate-600">Sebab</span>
              <select
                value={sumber}
                onChange={(e) => setSumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {Object.entries(SUMBER_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-600">Jumlah hari</span>
              <input
                type="number"
                min={1}
                max={366}
                value={jumlah}
                onChange={(e) =>
                  setJumlah(Math.max(1, parseInt(e.target.value || "1", 10)))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="text-sm block">
            <span className="text-slate-600">Catatan (opsional)</span>
            <input
              type="text"
              value={catatan}
              maxLength={300}
              onChange={(e) => setCatatan(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-rose-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition"
          >
            {saving ? "Menyimpan…" : "Tambah"}
          </button>
        </form>
      </section>

      {/* Daftar */}
      <section className="space-y-3">
        {items.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-600">
            Belum ada utang qadha tercatat. Semoga tetap istiqamah!
          </div>
        ) : (
          items.map((q) => (
            <div key={q.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {SUMBER_LABEL[q.sumber] ?? q.sumber}
                    </span>
                    {q.tahun && (
                      <span className="text-xs text-slate-400">
                        Ramadhan {q.tahun} H
                      </span>
                    )}
                    {q.selesai && (
                      <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                        Lunas
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {q.lunas}/{q.jumlah} hari dibayar · sisa {q.sisa}
                    {q.catatan ? ` · ${q.catatan}` : ""}
                  </p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${q.jumlah ? Math.min(100, (q.lunas / q.jumlah) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!q.selesai && (
                    <button
                      onClick={() => bayar(q.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 text-emerald-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-emerald-50"
                    >
                      <Check size={13} /> +1 hari
                    </button>
                  )}
                  <button
                    onClick={() => hapus(q.id)}
                    aria-label="Hapus"
                    className="rounded-lg border border-slate-200 text-slate-400 p-1.5 hover:text-rose-600 hover:border-rose-200"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
