"use client";

import {
  BookOpen,
  CalendarHeart,
  ChevronRight,
  Droplet,
  ListChecks,
  Moon,
  Sparkles,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MuslimahDashboard } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

const STATUS_STYLE: Record<string, { bg: string; chip: string }> = {
  haid: { bg: "from-rose-600 via-rose-500 to-pink-500", chip: "bg-white/20" },
  nifas: { bg: "from-rose-600 via-rose-500 to-pink-500", chip: "bg-white/20" },
  istihadhah: {
    bg: "from-amber-600 via-orange-500 to-amber-500",
    chip: "bg-white/20",
  },
  suci: { bg: "from-emerald-700 via-emerald-600 to-teal-600", chip: "bg-white/20" },
};

function YesNo({ boleh }: { boleh: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
        boleh ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      }`}
    >
      {boleh ? "Boleh" : "Tidak"}
    </span>
  );
}

export default function MuslimahPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const { data } = useSWR<MuslimahDashboard>(
    user ? "/muslimah/dashboard" : null,
    fetcher,
  );

  if (loading || !user) return <Spinner label="Memuat…" />;

  const style = data ? STATUS_STYLE[data.statusHaid.status] : STATUS_STYLE.suci;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-600 grid place-items-center">
          <Sparkles size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Muslimah</h1>
          <p className="text-sm text-slate-500">
            Asisten haid & ibadah — pribadi dan aman, hanya kamu yang melihat.
          </p>
        </div>
      </header>

      {/* Kartu status */}
      <section
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${style.bg} text-white p-6 shadow-lg`}
      >
        <div
          aria-hidden
          className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
            Status hari ini
          </p>
          <h2 className="text-3xl font-bold mt-1">
            {data?.statusHaid.label ?? "—"}
          </h2>
          {data && (
            <p className="text-white/85 text-sm mt-1">
              {data.hijri.weekday}, {data.hijri.formatted}
              {data.statusHaid.hariKe
                ? ` · hari ke-${data.statusHaid.hariKe}`
                : ""}
            </p>
          )}
          {data && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-lg ${style.chip} px-3 py-1.5`}>
                Sholat: {data.statusHaid.ibadah.sholat.boleh ? "✓" : "✕"}
              </span>
              <span className={`rounded-lg ${style.chip} px-3 py-1.5`}>
                Puasa: {data.statusHaid.ibadah.puasa.boleh ? "✓" : "✕"}
              </span>
              <span className={`rounded-lg ${style.chip} px-3 py-1.5`}>
                Tilawah mushaf: {data.statusHaid.ibadah.tilawah.boleh ? "✓" : "✕"}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Prediksi siklus */}
      {data?.prediksi.cukupData && data.prediksi.prediksiMulai && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-700/80">
            Prediksi siklus
          </p>
          <p className="text-sm text-rose-900 mt-1">{data.prediksi.keterangan}</p>
          <p className="text-xs text-rose-700/70 mt-1">
            Perkiraan mulai: {data.prediksi.prediksiMulai}
          </p>
        </section>
      )}

      {/* Ringkasan ibadah */}
      {data && (
        <section className="card p-5 space-y-3">
          <h3 className="font-semibold text-slate-900">Panduan ibadah</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Moon size={16} className="mt-0.5 text-slate-400 shrink-0" />
              <span className="flex-1 text-slate-700">
                <span className="inline-flex items-center gap-2">
                  <strong>Sholat</strong>
                  <YesNo boleh={data.statusHaid.ibadah.sholat.boleh} />
                </span>
                <br />
                {data.statusHaid.ibadah.sholat.teks}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Utensils size={16} className="mt-0.5 text-slate-400 shrink-0" />
              <span className="flex-1 text-slate-700">
                <span className="inline-flex items-center gap-2">
                  <strong>Puasa</strong>
                  <YesNo boleh={data.statusHaid.ibadah.puasa.boleh} />
                </span>
                <br />
                {data.statusHaid.ibadah.puasa.teks}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <BookOpen size={16} className="mt-0.5 text-slate-400 shrink-0" />
              <span className="flex-1 text-slate-700">
                <span className="inline-flex items-center gap-2">
                  <strong>Tilawah</strong>
                  <YesNo boleh={data.statusHaid.ibadah.tilawah.boleh} />
                </span>
                <br />
                {data.statusHaid.ibadah.tilawah.teks}
              </span>
            </li>
          </ul>
        </section>
      )}

      {/* Ringkasan angka */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/muslimah/qadha"
          className="card p-4 hover:border-rose-300 transition group"
        >
          <p className="text-xs text-slate-500">Sisa qadha puasa</p>
          <p className="text-2xl font-bold text-slate-900">
            {data?.qadhaPuasa.sisa ?? 0}{" "}
            <span className="text-sm font-medium text-slate-400">hari</span>
          </p>
          <span className="text-xs text-rose-600 font-medium inline-flex items-center gap-0.5 group-hover:gap-1.5 transition-all">
            Kelola <ChevronRight size={12} />
          </span>
        </Link>
        <Link
          href="/muslimah/puasa-sunnah"
          className="card p-4 hover:border-emerald-300 transition group"
        >
          <p className="text-xs text-slate-500">Puasa sunnah berikutnya</p>
          {data?.puasaSunnahBerikutnya ? (
            <>
              <p className="text-lg font-bold text-slate-900 leading-tight">
                {data.puasaSunnahBerikutnya.label[0]}
              </p>
              <p className="text-xs text-slate-500">
                {data.puasaSunnahBerikutnya.weekday},{" "}
                {data.puasaSunnahBerikutnya.tanggal}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
        </Link>
      </section>

      {/* Pintasan */}
      <section className="grid sm:grid-cols-2 gap-3">
        <Link
          href="/muslimah/haid"
          className="card p-5 flex items-center gap-3 hover:border-rose-300 transition"
        >
          <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 grid place-items-center shrink-0">
            <Droplet size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Kalender Haid</p>
            <p className="text-xs text-slate-500">
              Catat & lihat riwayat siklus
            </p>
          </div>
        </Link>
        <Link
          href="/muslimah/puasa-sunnah"
          className="card p-5 flex items-center gap-3 hover:border-emerald-300 transition"
        >
          <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
            <CalendarHeart size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Pengingat Puasa Sunnah</p>
            <p className="text-xs text-slate-500">
              Senin–Kamis, Ayyamul Bidh, Arafah…
            </p>
          </div>
        </Link>
        <Link
          href="/muslimah/amalan"
          className="card p-5 flex items-center gap-3 hover:border-violet-300 transition"
        >
          <div className="h-11 w-11 rounded-xl bg-violet-50 text-violet-600 grid place-items-center shrink-0">
            <ListChecks size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">Amalan Harian</p>
            <p className="text-xs text-slate-500">
              {data
                ? `${data.amalanHariIni.selesai}/${data.amalanHariIni.total} amalan hari ini`
                : "Ceklis ibadah harian"}
            </p>
          </div>
        </Link>
        <Link
          href="/tilawah"
          className="card p-5 flex items-center gap-3 hover:border-emerald-300 transition"
        >
          <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0">
            <BookOpen size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Target Tilawah</p>
            <p className="text-xs text-slate-500">Streak baca & rencana khatam</p>
          </div>
        </Link>
      </section>

      {data && data.hafalanReviewDue > 0 && (
        <Link
          href="/me"
          className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 hover:bg-amber-100 transition"
        >
          📖 Ada <strong>{data.hafalanReviewDue}</strong> ayat hafalan yang perlu
          muraja&apos;ah hari ini.
        </Link>
      )}

      <p className="text-xs text-slate-400 leading-relaxed">
        Catatan: panduan fikih di sini mengikuti pendapat jumhur (mayoritas)
        ulama sebagai pengingat, bukan fatwa. Untuk kasus khusus, silakan rujuk
        ke ustadzah terpercaya.
      </p>
    </div>
  );
}
