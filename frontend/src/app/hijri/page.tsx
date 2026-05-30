"use client";

import { Calendar, MoveLeft, MoveRight, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  HIJRI_MONTHS_AR,
  HIJRI_MONTHS_ID,
  gregorianToHijri,
  hijriToGregorian,
  hijriToday,
} from "@/lib/hijri";

const GREG_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export default function HijriPage() {
  const [today, setToday] = useState<ReturnType<typeof hijriToday> | null>(null);

  // Gregorian → Hijri form
  const [gDay, setGDay] = useState(1);
  const [gMonth, setGMonth] = useState(1);
  const [gYear, setGYear] = useState(2026);

  // Hijri → Gregorian form
  const [hDay, setHDay] = useState(1);
  const [hMonth, setHMonth] = useState(1);
  const [hYear, setHYear] = useState(1446);

  useEffect(() => {
    const t = hijriToday();
    setToday(t);
    const now = new Date();
    setGDay(now.getDate());
    setGMonth(now.getMonth() + 1);
    setGYear(now.getFullYear());
    setHDay(t.hijri.day);
    setHMonth(t.hijri.month);
    setHYear(t.hijri.year);
  }, []);

  const fromGreg = useMemo(() => {
    try {
      return gregorianToHijri(new Date(gYear, gMonth - 1, gDay));
    } catch {
      return null;
    }
  }, [gYear, gMonth, gDay]);

  const fromHijri = useMemo(() => {
    try {
      return hijriToGregorian(hYear, hMonth, hDay);
    } catch {
      return null;
    }
  }, [hYear, hMonth, hDay]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 grid place-items-center">
          <Calendar size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Kalender Hijriah</h1>
          <p className="text-sm text-slate-500">
            Konversi tanggal Masehi ↔ Hijriah secara instan, offline-capable.
          </p>
        </div>
      </header>

      {today && (
        <section className="rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white p-6 sm:p-8 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
            Hari ini
          </p>
          <p className="text-sm sm:text-base font-semibold mt-2 text-emerald-50/90">
            {today.hijri.weekday}, {today.gregorian.formatted}
          </p>
          <p className="arabic text-2xl sm:text-3xl mt-1 break-words">
            {today.hijri.day} {today.hijri.monthNameAr} {today.hijri.year} هـ
          </p>
          <p className="text-xl sm:text-2xl font-semibold mt-2">
            {today.hijri.formatted}
          </p>
        </section>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sun size={18} className="text-amber-600" />
            <h2 className="font-semibold">Masehi → Hijriah</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <input
              type="number"
              min={1}
              max={31}
              value={gDay}
              onChange={(e) => setGDay(parseInt(e.target.value || "1", 10))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Tgl"
            />
            <select
              value={gMonth}
              onChange={(e) => setGMonth(parseInt(e.target.value, 10))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {GREG_MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              min={1900}
              max={2100}
              value={gYear}
              onChange={(e) => setGYear(parseInt(e.target.value || "2026", 10))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Thn"
            />
          </div>
          {fromGreg && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
              <p className="text-xs uppercase tracking-wider text-amber-700/80 mb-1">
                Hasil Hijriah
              </p>
              <p className="text-lg font-semibold text-amber-900">
                {fromGreg.hijri.weekday}, {fromGreg.hijri.formatted}
              </p>
              <p className="arabic text-xl text-amber-800 mt-1">
                {fromGreg.hijri.day} {fromGreg.hijri.monthNameAr} {fromGreg.hijri.year} هـ
              </p>
            </div>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={18} className="text-emerald-700" />
            <h2 className="font-semibold">Hijriah → Masehi</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <input
              type="number"
              min={1}
              max={30}
              value={hDay}
              onChange={(e) => setHDay(parseInt(e.target.value || "1", 10))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Tgl"
            />
            <select
              value={hMonth}
              onChange={(e) => setHMonth(parseInt(e.target.value, 10))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {HIJRI_MONTHS_ID.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              min={1300}
              max={1600}
              value={hYear}
              onChange={(e) => setHYear(parseInt(e.target.value || "1446", 10))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Thn"
            />
          </div>
          {fromHijri && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <p className="text-xs uppercase tracking-wider text-emerald-700/80 mb-1">
                Hasil Masehi
              </p>
              <p className="text-lg font-semibold text-emerald-900">
                {fromHijri.gregorian.weekday}, {fromHijri.gregorian.formatted}
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="card p-5">
        <h3 className="font-semibold mb-3">12 Bulan Hijriah</h3>
        <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {HIJRI_MONTHS_ID.map((m, i) => (
            <li
              key={m}
              className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50"
            >
              <span className="font-medium">{i + 1}. {m}</span>
              <span className="arabic text-base text-slate-600">
                {HIJRI_MONTHS_AR[i]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-xs text-slate-400 flex items-center gap-4 pt-2">
        <span className="inline-flex items-center gap-1">
          <MoveLeft size={12} /> Masehi
        </span>
        <span className="inline-flex items-center gap-1">
          Hijriah <MoveRight size={12} />
        </span>
        <span>
          Menggunakan kalender Islam tabular (akurasi ± 1 hari, rentang 1937–2077 M).
        </span>
      </footer>
    </div>
  );
}
