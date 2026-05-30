"use client";

import {
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetcher } from "@/lib/api";

type Mode = "sambung-ayat" | "isi-kata";

interface AyatLite {
  id: number;
  surahId: number;
  nomorAyat: number;
  teksArab: string;
  teksIndonesia: string;
  surah: { nomor: number; namaLatin: string };
}

interface SambungSoal {
  mode: "sambung-ayat";
  anchor: AyatLite;
  options: { id: number; teksArab: string; teksIndonesia: string }[];
  correctId: number;
}

interface IsiKataSoal {
  mode: "isi-kata";
  ayat: AyatLite;
  teksBlanked: string;
  options: string[];
  correctWord: string;
}

type Soal = SambungSoal | IsiKataSoal;

export default function QuizPage() {
  const [mode, setMode] = useState<Mode>("sambung-ayat");
  const [soal, setSoal] = useState<Soal | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ benar: 0, salah: 0 });

  const fetchNew = useCallback(async (m: Mode) => {
    setLoading(true);
    setPicked(null);
    try {
      const data = await fetcher<Soal>(`/quiz/${m}`);
      setSoal(data);
    } catch {
      setSoal(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNew(mode);
  }, [mode, fetchNew]);

  function evaluate(pick: string): void {
    if (!soal || picked !== null) return;
    setPicked(pick);
    let correct = false;
    if (soal.mode === "sambung-ayat") {
      correct = pick === String(soal.correctId);
    } else {
      correct = pick === soal.correctWord;
    }
    setScore((s) => ({
      benar: s.benar + (correct ? 1 : 0),
      salah: s.salah + (correct ? 0 : 1),
    }));
  }

  function statusFor(value: string): "neutral" | "good" | "bad" {
    if (!picked) return "neutral";
    if (!soal) return "neutral";
    const correctVal =
      soal.mode === "sambung-ayat"
        ? String(soal.correctId)
        : soal.correctWord;
    if (value === correctVal) return "good";
    if (value === picked) return "bad";
    return "neutral";
  }

  const total = score.benar + score.salah;
  const akurasi = total > 0 ? Math.round((score.benar / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-emerald-700">
          <Sparkles size={18} />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Quiz Hafalan
          </h1>
        </div>
        <p className="text-slate-600 mt-2">
          Asah hafalan dengan dua mode: sambung ayat & isi kata yang hilang.
          Skor disimpan di sesi ini saja.
        </p>
      </header>

      <div className="flex gap-2 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => {
            setMode("sambung-ayat");
            setScore({ benar: 0, salah: 0 });
          }}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
            mode === "sambung-ayat"
              ? "bg-white shadow text-slate-900"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Sambung Ayat
        </button>
        <button
          onClick={() => {
            setMode("isi-kata");
            setScore({ benar: 0, salah: 0 });
          }}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
            mode === "isi-kata"
              ? "bg-white shadow text-slate-900"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Isi Kata
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-xs uppercase text-emerald-700 font-semibold">
            Benar
          </p>
          <p className="text-2xl font-bold text-emerald-700">{score.benar}</p>
        </div>
        <div className="rounded-xl bg-rose-50 p-3">
          <p className="text-xs uppercase text-rose-700 font-semibold">Salah</p>
          <p className="text-2xl font-bold text-rose-700">{score.salah}</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-xs uppercase text-amber-700 font-semibold">
            Akurasi
          </p>
          <p className="text-2xl font-bold text-amber-700">{akurasi}%</p>
        </div>
      </div>

      {loading && (
        <div className="card p-12 grid place-items-center text-slate-400">
          <Loader2 size={28} className="animate-spin" />
        </div>
      )}

      {!loading && soal?.mode === "sambung-ayat" && (
        <section className="card p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Soal · Q.S. {soal.anchor.surah.namaLatin}: {soal.anchor.nomorAyat}
          </p>
          <p className="arabic text-xl sm:text-2xl text-right leading-loose text-slate-900 break-words">
            {soal.anchor.teksArab}
          </p>
          <p className="text-slate-600 text-sm italic">
            {soal.anchor.teksIndonesia}
          </p>
          <p className="text-sm font-semibold text-slate-700 mt-3">
            Manakah ayat berikutnya?
          </p>
          <div className="space-y-2">
            {soal.options.map((o) => {
              const s = statusFor(String(o.id));
              return (
                <button
                  key={o.id}
                  disabled={picked !== null}
                  onClick={() => evaluate(String(o.id))}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                    s === "good"
                      ? "border-emerald-400 bg-emerald-50"
                      : s === "bad"
                        ? "border-rose-400 bg-rose-50"
                        : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40"
                  }`}
                >
                  <p className="arabic text-base sm:text-lg leading-loose text-slate-900 text-right break-words">
                    {o.teksArab}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.teksIndonesia}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!loading && soal?.mode === "isi-kata" && (
        <section className="card p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Soal · Q.S. {soal.ayat.surah.namaLatin}: {soal.ayat.nomorAyat}
          </p>
          <p className="arabic text-2xl text-right leading-loose text-slate-900">
            {soal.teksBlanked}
          </p>
          <p className="text-slate-600 text-sm italic">
            {soal.ayat.teksIndonesia}
          </p>
          <p className="text-sm font-semibold text-slate-700 mt-3">
            Kata yang hilang adalah:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {soal.options.map((opt) => {
              const s = statusFor(opt);
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => evaluate(opt)}
                  className={`arabic rounded-xl border px-3 sm:px-4 py-3 text-base sm:text-lg text-center transition break-words ${
                    s === "good"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                      : s === "bad"
                        ? "border-rose-400 bg-rose-50 text-rose-900"
                        : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {picked && soal && (
        <div className="flex items-center gap-2 text-sm">
          {(soal.mode === "sambung-ayat" && picked === String(soal.correctId)) ||
          (soal.mode === "isi-kata" && picked === soal.correctWord) ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <Check size={14} /> Tepat!
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
              <X size={14} /> Belum tepat
            </span>
          )}
          <button
            onClick={() => void fetchNew(mode)}
            className="ml-auto inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <RefreshCw size={14} /> Soal Baru
          </button>
        </div>
      )}

      {!picked && !loading && (
        <button
          onClick={() => void fetchNew(mode)}
          className="text-xs text-slate-500 hover:text-emerald-700 inline-flex items-center gap-1"
        >
          <RefreshCw size={12} /> Lewati / soal lain
        </button>
      )}

      {total >= 10 && (
        <div className="card p-5 bg-amber-50 border-amber-100">
          <div className="flex items-center gap-3">
            <Trophy size={20} className="text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Mantap!</p>
              <p className="text-sm text-amber-700">
                Sudah {total} soal selesai dengan akurasi {akurasi}%.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
