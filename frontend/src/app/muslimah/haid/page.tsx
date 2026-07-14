"use client";

import { ArrowLeft, Droplet, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetch, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { HaidPeriod, IbadahStatusResult, PrediksiHaid } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

const JENIS_LABEL: Record<string, string> = {
  haid: "Haid",
  nifas: "Nifas",
  istihadhah: "Istihadhah",
};

const JENIS_STYLE: Record<string, string> = {
  haid: "bg-rose-100 text-rose-700",
  nifas: "bg-pink-100 text-pink-700",
  istihadhah: "bg-amber-100 text-amber-700",
};

function todayIso(): string {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  return wib.toISOString().slice(0, 10);
}

export default function HaidPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [jenis, setJenis] = useState<"haid" | "nifas" | "istihadhah">("haid");
  const [mulai, setMulai] = useState(todayIso());
  const [selesai, setSelesai] = useState("");
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const { data: status } = useSWR<IbadahStatusResult>(
    user ? "/muslimah/status" : null,
    fetcher,
  );
  const { data: periods, mutate } = useSWR<HaidPeriod[]>(
    user ? "/muslimah/haid?limit=100" : null,
    fetcher,
  );
  const { data: prediksi, mutate: mutatePrediksi } = useSWR<PrediksiHaid>(
    user ? "/muslimah/prediksi" : null,
    fetcher,
  );

  if (loading || !user) return <Spinner label="Memuat…" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const { data } = await apiFetch<HaidPeriod>("/muslimah/haid", {
        method: "POST",
        body: JSON.stringify({
          jenis,
          mulai,
          selesai: selesai || undefined,
          catatan: catatan || undefined,
        }),
      });
      const qr = data.qadhaRamadhan ?? 0;
      setMsg(
        qr > 0
          ? `Tersimpan. ${qr} hari jatuh di Ramadhan — tambahkan ke qadha puasa di menu Qadha.`
          : "Periode tersimpan.",
      );
      setSelesai("");
      setCatatan("");
      await Promise.all([mutate(), mutatePrediksi()]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function setSelesaiHariIni(p: HaidPeriod) {
    await apiFetch(`/muslimah/haid/${p.id}`, {
      method: "PUT",
      body: JSON.stringify({ selesai: todayIso() }),
    }).catch(() => undefined);
    await Promise.all([mutate(), mutatePrediksi()]);
  }

  async function hapus(id: string) {
    if (!confirm("Hapus periode ini?")) return;
    await apiFetch(`/muslimah/haid/${id}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    await Promise.all([mutate(), mutatePrediksi()]);
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
          <Droplet size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Kalender Haid</h1>
          <p className="text-sm text-slate-500">
            Catat siklus, lihat status ibadah otomatis.
          </p>
        </div>
      </header>

      {/* Status saat ini */}
      {status && (
        <section className="card p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">
            Status hari ini
          </p>
          <p className="text-xl font-bold text-slate-900">{status.ibadah.label}</p>
          <p className="text-sm text-slate-500">
            {status.hijri.weekday}, {status.hijri.formatted}
            {status.hariKe ? ` · hari ke-${status.hariKe}` : ""}
          </p>
          <ul className="mt-3 grid sm:grid-cols-3 gap-2 text-xs">
            <li className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="font-semibold text-slate-600">Sholat</span>
              <br />
              <span
                className={
                  status.ibadah.sholat.boleh ? "text-emerald-700" : "text-rose-600"
                }
              >
                {status.ibadah.sholat.boleh ? "Boleh / wajib" : "Tidak"}
              </span>
            </li>
            <li className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="font-semibold text-slate-600">Puasa</span>
              <br />
              <span
                className={
                  status.ibadah.puasa.boleh ? "text-emerald-700" : "text-rose-600"
                }
              >
                {status.ibadah.puasa.boleh ? "Boleh / sah" : "Tidak"}
              </span>
            </li>
            <li className="rounded-lg bg-slate-50 px-3 py-2">
              <span className="font-semibold text-slate-600">Tilawah mushaf</span>
              <br />
              <span
                className={
                  status.ibadah.tilawah.boleh ? "text-emerald-700" : "text-rose-600"
                }
              >
                {status.ibadah.tilawah.boleh ? "Boleh" : "Hati-hati"}
              </span>
            </li>
          </ul>
        </section>
      )}

      {/* Prediksi siklus */}
      {prediksi && (
        <section className="card p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">
            Prediksi siklus
          </p>
          {prediksi.cukupData ? (
            <>
              <p className="text-sm text-slate-700">{prediksi.keterangan}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-rose-50 px-3 py-2">
                  <span className="text-slate-500">Perkiraan mulai</span>
                  <br />
                  <span className="font-semibold text-rose-700">
                    {prediksi.prediksiMulai ?? "—"}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Rata-rata siklus</span>
                  <br />
                  <span className="font-semibold text-slate-900">
                    {prediksi.rataSiklus ?? "—"} hari
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">{prediksi.keterangan}</p>
          )}
        </section>
      )}

      {/* Form catat */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Plus size={16} /> Catat periode
        </h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["haid", "nifas", "istihadhah"] as const).map((j) => (
              <button
                type="button"
                key={j}
                onClick={() => setJenis(j)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition ${
                  jenis === j
                    ? "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {JENIS_LABEL[j]}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-slate-600">Mulai</span>
              <input
                type="date"
                required
                value={mulai}
                max={todayIso()}
                onChange={(e) => setMulai(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600">Selesai (opsional)</span>
              <input
                type="date"
                value={selesai}
                min={mulai}
                onChange={(e) => setSelesai(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="text-sm block">
            <span className="text-slate-600">Catatan (opsional)</span>
            <input
              type="text"
              value={catatan}
              maxLength={500}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="mis. keluhan, warna, dsb."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {err && <p className="text-sm text-rose-600">{err}</p>}
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-rose-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 transition"
          >
            {saving ? "Menyimpan…" : "Simpan periode"}
          </button>
        </form>
      </section>

      {/* Riwayat */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-bold text-xl text-slate-900">Riwayat siklus</h2>
          <span className="text-sm text-slate-500">
            {periods?.length ?? 0} catatan
          </span>
        </div>
        {!periods || periods.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-600">
            Belum ada catatan. Mulai dengan mencatat periode di atas.
          </div>
        ) : (
          <div className="space-y-3">
            {periods.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${JENIS_STYLE[p.jenis]}`}
                    >
                      {JENIS_LABEL[p.jenis]}
                    </span>
                    <p className="mt-1.5 text-sm font-medium text-slate-900">
                      {p.mulai}
                      {p.selesai ? ` → ${p.selesai}` : " → sekarang"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.berlangsung
                        ? "Sedang berlangsung"
                        : `${p.durasiHari} hari`}
                      {p.catatan ? ` · ${p.catatan}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.berlangsung && (
                      <button
                        onClick={() => setSelesaiHariIni(p)}
                        className="rounded-lg border border-emerald-300 text-emerald-700 px-2.5 py-1.5 text-xs font-semibold hover:bg-emerald-50"
                      >
                        Selesai hari ini
                      </button>
                    )}
                    <button
                      onClick={() => hapus(p.id)}
                      aria-label="Hapus"
                      className="rounded-lg border border-slate-200 text-slate-400 p-1.5 hover:text-rose-600 hover:border-rose-200"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
