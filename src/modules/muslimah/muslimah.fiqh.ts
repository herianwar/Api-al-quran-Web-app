/**
 * Fiqh helpers for the "Asisten Haid & Ibadah" feature.
 *
 * Pure functions only — no DB, no NestJS. Everything is computed from dates
 * via the self-hosted Hijri converter so the logic is testable in isolation.
 *
 * IMPORTANT (disclaimer): the rulings encoded here follow the mainstream
 * (jumhur) Sunni position and are meant as a study/reminder aid, NOT a fatwa.
 * Edge cases (lama haid maksimal, darah keluar setelah suci, dll.) sebaiknya
 * dirujuk ke ustadz/ustadzah. The UI surfaces this disclaimer.
 */

import {
  gregorianStringToHijri,
  hijriStringToGregorian,
} from '../hijri/hijri.converter';

export type HaidJenis = 'haid' | 'nifas' | 'istihadhah';
export type IbadahStatus = HaidJenis | 'suci';

/** Lama (hari) wajar & maksimal per jenis — dipakai untuk prediksi & warning. */
export const DURASI = {
  haid: { wajarMin: 6, wajarMax: 7, maks: 15 },
  nifas: { wajarMin: 0, wajarMax: 40, maks: 40 },
} as const;

export interface RulingItem {
  boleh: boolean;
  teks: string;
}

export interface IbadahRuling {
  status: IbadahStatus;
  label: string;
  sholat: RulingItem;
  puasa: RulingItem;
  tilawah: RulingItem;
  /** Ringkasan tambahan / hal yang perlu diperhatikan. */
  catatan: string[];
}

/** Ruling ibadah untuk sebuah status (haid/nifas/istihadhah/suci). */
export function rulingFor(status: IbadahStatus): IbadahRuling {
  switch (status) {
    case 'haid':
    case 'nifas': {
      const isNifas = status === 'nifas';
      const nama = isNifas ? 'Nifas' : 'Haid';
      return {
        status,
        label: `Sedang ${nama}`,
        sholat: {
          boleh: false,
          teks: `Tidak wajib dan tidak boleh sholat. Sholat yang ditinggalkan saat ${nama.toLowerCase()} TIDAK perlu diqadha.`,
        },
        puasa: {
          boleh: false,
          teks: `Tidak boleh berpuasa (puasa tidak sah). Puasa wajib (Ramadhan) yang ditinggalkan WAJIB diqadha setelah suci.`,
        },
        tilawah: {
          boleh: false,
          teks: 'Jumhur ulama: tidak menyentuh mushaf. Berdzikir, berdoa, dan membaca dari hafalan/HP (tanpa menyentuh mushaf) dibolehkan sebagian ulama.',
        },
        catatan: isNifas
          ? [
              'Nifas maksimal 40 hari. Bila darah berhenti sebelum 40 hari, segera mandi besar lalu kembali sholat & boleh puasa.',
              'Bila sudah 40 hari darah belum berhenti, mandi besar dan mulai sholat (darah setelahnya dihukumi istihadhah).',
            ]
          : [
              'Lama haid wajar 6–7 hari, maksimal 15 hari menurut jumhur.',
              'Bila darah berhenti, mandi besar (ghusl) dulu sebelum kembali sholat & puasa.',
              'Saat haid tetap bisa beramal: dzikir, doa, istighfar, sedekah, menuntut ilmu, dan mendengarkan murottal.',
            ],
      };
    }
    case 'istihadhah':
      return {
        status,
        label: 'Istihadhah (darah penyakit)',
        sholat: {
          boleh: true,
          teks: 'Tetap WAJIB sholat. Berwudhu setiap masuk waktu sholat dan jaga kebersihan.',
        },
        puasa: {
          boleh: true,
          teks: 'Tetap WAJIB & sah berpuasa. Istihadhah tidak menggugurkan puasa.',
        },
        tilawah: {
          boleh: true,
          teks: 'Boleh membaca & menyentuh mushaf (dalam keadaan suci dari hadats besar, cukup berwudhu).',
        },
        catatan: [
          'Istihadhah = darah di luar kebiasaan haid (warna/lama tidak normal). Dihukumi suci.',
          'Bedakan masa haid (kebiasaan bulanan) dari istihadhah; bila ragu, rujuk ke ustadzah.',
        ],
      };
    default:
      return {
        status: 'suci',
        label: 'Suci',
        sholat: { boleh: true, teks: 'Wajib menjalankan sholat 5 waktu.' },
        puasa: { boleh: true, teks: 'Boleh & sah berpuasa (wajib maupun sunnah).' },
        tilawah: {
          boleh: true,
          teks: 'Boleh membaca & menyentuh mushaf Al-Qur’an.',
        },
        catatan: ['Manfaatkan masa suci untuk memperbanyak ibadah & tilawah.'],
      };
  }
}

// ─── Tanggal & zona waktu ──────────────────────────────────────────────

/** ISO `YYYY-MM-DD` untuk hari ini di zona WIB (UTC+7), apa pun TZ server. */
export function jakartaTodayIso(now: Date = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/** Validasi & normalisasi string `YYYY-MM-DD`; lempar Error bila tak valid. */
export function assertIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error('Format tanggal harus YYYY-MM-DD');
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new Error('Tanggal tidak valid');
  return iso;
}

/** Selisih hari (inklusif) antara dua tanggal ISO. addDays bisa negatif. */
export function isoToUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDaysIso(iso: string, days: number): string {
  const d = isoToUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Jumlah hari dari `a` ke `b` inklusif (a<=b). */
export function inclusiveDays(aIso: string, bIso: string): number {
  const a = isoToUtcDate(aIso).getTime();
  const b = isoToUtcDate(bIso).getTime();
  return Math.floor((b - a) / 86_400_000) + 1;
}

// ─── Rentang periode: irisan & pencarian periode yang mencakup tanggal ──

/**
 * Sentinel "tak hingga" untuk periode yang masih berlangsung (`selesai=null`).
 * Dipakai HANYA sebagai batas atas saat membandingkan string tanggal — nilai
 * ini tidak pernah disimpan ke DB dan tidak pernah dikirim ke client.
 */
export const OPEN_END_ISO = '9999-12-31';

/**
 * Normalisasi apa pun (Date dari Prisma, string ISO penuh, atau `YYYY-MM-DD`)
 * menjadi tanggal kalender murni `YYYY-MM-DD`.
 *
 * Kolom `mulai`/`selesai` adalah `@db.Date` — tanggal kalender lokal user, BUKAN
 * instant. Prisma mengembalikannya sebagai `Date` di tengah malam UTC, jadi
 * memotong komponen UTC selalu aman dan tidak pernah bergeser sehari (berbeda
 * dengan `toLocaleDateString`/getFullYear yang ikut TZ server).
 */
export function toIsoDateOnly(value: string | Date): string {
  return (
    typeof value === 'string' ? value : value.toISOString()
  ).slice(0, 10);
}

/** Rentang tanggal (inklusif). `selesai=null` berarti terbuka sampai +∞. */
export interface PeriodeRange {
  jenis: string;
  mulai: string; // ISO YYYY-MM-DD
  selesai: string | null; // ISO YYYY-MM-DD, null = masih berlangsung
}

/** Batas akhir efektif sebuah rentang (periode berlangsung = +∞). */
function endOf(selesai: string | null): string {
  return selesai ?? OPEN_END_ISO;
}

/**
 * Dua rentang inklusif beririsan bila `aStart <= bEnd && bStart <= aEnd`.
 * Perbandingan dilakukan sebagai string `YYYY-MM-DD` (date-only, lexicographic
 * = kronologis) sehingga bebas dari jam/timezone.
 */
export function rangesOverlap(
  aMulai: string,
  aSelesai: string | null,
  bMulai: string,
  bSelesai: string | null,
): boolean {
  return aMulai <= endOf(bSelesai) && bMulai <= endOf(aSelesai);
}

/** Apakah periode mencakup tanggal `iso` (inklusif, open-ended = +∞)? */
export function coversDate(p: PeriodeRange, iso: string): boolean {
  return p.mulai <= iso && iso <= endOf(p.selesai);
}

/**
 * Satu-satunya sumber kebenaran status pada sebuah tanggal: periode milik user
 * yang mencakup `iso`. Bila (karena data lama yang korup) ada lebih dari satu,
 * pilih yang paling akhir mulainya; seri → yang masih berlangsung; seri lagi →
 * urut id agar hasilnya deterministik, bukan bergantung urutan baris DB.
 */
export function findCoveringPeriod<T extends PeriodeRange & { id?: string }>(
  periods: T[],
  iso: string,
): T | null {
  const covering = periods.filter((p) => coversDate(p, iso));
  if (covering.length === 0) return null;
  covering.sort((a, b) => {
    if (a.mulai !== b.mulai) return a.mulai < b.mulai ? 1 : -1; // mulai desc
    const aOpen = a.selesai === null ? 0 : 1;
    const bOpen = b.selesai === null ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen; // berlangsung duluan
    return (a.id ?? '') < (b.id ?? '') ? -1 : 1;
  });
  return covering[0];
}

// ─── Puasa sunnah & hari terlarang ─────────────────────────────────────

export interface PuasaSunnahDay {
  tanggal: string; // ISO Masehi
  weekday: string; // nama hari (Indonesia)
  hijri: string; // "13 Ramadhan 1447 H"
  hijriDay: number;
  hijriMonth: number;
  label: string[]; // mis. ["Puasa Senin", "Ayyamul Bidh"]
  utama: boolean; // puasa yang sangat ditekankan (Arafah, 'Asyura)
}

export interface HariTerlarang {
  tanggal: string;
  weekday: string;
  hijri: string;
  sebab: string;
}

/** Hari yang HARAM berpuasa (mengembalikan sebab, atau null). */
export function hariTerlarangSebab(
  hijriMonth: number,
  hijriDay: number,
): string | null {
  if (hijriMonth === 10 && hijriDay === 1) return 'Idul Fitri (1 Syawal)';
  if (hijriMonth === 12 && hijriDay === 10) return 'Idul Adha (10 Dzulhijjah)';
  if (hijriMonth === 12 && hijriDay >= 11 && hijriDay <= 13)
    return 'Hari Tasyriq (11–13 Dzulhijjah)';
  return null;
}

/** Label puasa sunnah untuk sebuah hari (kosong = bukan hari sunnah). */
function sunnahLabels(
  weekday: string,
  hijriMonth: number,
  hijriDay: number,
): { label: string[]; utama: boolean } {
  const label: string[] = [];
  let utama = false;

  // Senin & Kamis
  if (weekday === 'Senin') label.push('Puasa Senin');
  if (weekday === 'Kamis') label.push('Puasa Kamis');

  // Ayyamul Bidh (13, 14, 15 setiap bulan Hijriah)
  if (hijriDay === 13 || hijriDay === 14 || hijriDay === 15) {
    label.push('Ayyamul Bidh');
  }

  // Arafah (9 Dzulhijjah) — sangat ditekankan
  if (hijriMonth === 12 && hijriDay === 9) {
    label.push('Puasa Arafah');
    utama = true;
  }
  // Tasu'a & 'Asyura (9 & 10 Muharram)
  if (hijriMonth === 1 && hijriDay === 9) label.push("Puasa Tasu'a");
  if (hijriMonth === 1 && hijriDay === 10) {
    label.push("Puasa 'Asyura");
    utama = true;
  }
  // 6 hari Syawal (2–8 Syawal sebagai anjuran awal; bisa kapan saja di Syawal)
  if (hijriMonth === 10 && hijriDay >= 2 && hijriDay <= 8) {
    label.push('6 Hari Syawal');
  }

  return { label, utama };
}

/**
 * Hitung hari-hari puasa sunnah pada rentang `mulai`..(`mulai`+`hari`-1).
 * Hari yang terlarang berpuasa otomatis dikecualikan dari daftar sunnah.
 */
export function puasaSunnahRange(
  mulaiIso: string,
  hari: number,
): PuasaSunnahDay[] {
  const out: PuasaSunnahDay[] = [];
  for (let i = 0; i < hari; i++) {
    const iso = addDaysIso(mulaiIso, i);
    const h = gregorianStringToHijri(iso);
    if (hariTerlarangSebab(h.hijri.month, h.hijri.day)) continue;
    const { label, utama } = sunnahLabels(
      h.gregorian.weekday,
      h.hijri.month,
      h.hijri.day,
    );
    if (label.length === 0) continue;
    out.push({
      tanggal: iso,
      weekday: h.gregorian.weekday,
      hijri: h.hijri.formatted,
      hijriDay: h.hijri.day,
      hijriMonth: h.hijri.month,
      label,
      utama,
    });
  }
  return out;
}

/** Hari terlarang berpuasa dalam rentang (untuk ditampilkan sebagai info). */
export function hariTerlarangRange(
  mulaiIso: string,
  hari: number,
): HariTerlarang[] {
  const out: HariTerlarang[] = [];
  for (let i = 0; i < hari; i++) {
    const iso = addDaysIso(mulaiIso, i);
    const h = gregorianStringToHijri(iso);
    const sebab = hariTerlarangSebab(h.hijri.month, h.hijri.day);
    if (!sebab) continue;
    out.push({
      tanggal: iso,
      weekday: h.gregorian.weekday,
      hijri: h.hijri.formatted,
      sebab,
    });
  }
  return out;
}

// ─── Qadha puasa dari overlap dengan Ramadhan ──────────────────────────

// ─── Prediksi siklus haid ──────────────────────────────────────────────

export interface PrediksiHaid {
  cukupData: boolean;
  jumlahData: number;
  rataSiklus: number | null; // hari (start-to-start)
  rataDurasi: number | null; // hari per periode haid
  haidTerakhir: string | null; // tanggal mulai haid terakhir (ISO)
  prediksiMulai: string | null; // perkiraan mulai haid berikutnya (ISO)
  prediksiSelesai: string | null; // perkiraan selesai (ISO)
  hariLagi: number | null; // selisih hari dari `acuan` ke prediksiMulai (boleh negatif)
  keterangan: string;
}

interface PeriodInput {
  jenis: string;
  mulai: string; // ISO
  selesai: string | null; // ISO
}

/**
 * Prediksi haid berikutnya dari riwayat. Hanya memakai periode `jenis=haid`.
 * Rata siklus = rata-rata jarak antar tanggal-mulai berurutan. Rata durasi =
 * rata-rata lama periode yang sudah selesai. Butuh minimal 2 periode haid
 * untuk menghitung siklus.
 *
 * `acuanIso` = tanggal acuan untuk menghitung `hariLagi` (default hari ini WIB).
 */
export function predictNextHaid(
  periods: PeriodInput[],
  acuanIso: string = jakartaTodayIso(),
): PrediksiHaid {
  const haid = periods
    .filter((p) => p.jenis === 'haid')
    .map((p) => p.mulai)
    .sort(); // ascending ISO
  const jumlahData = haid.length;

  if (jumlahData < 2) {
    return {
      cukupData: false,
      jumlahData,
      rataSiklus: null,
      rataDurasi: null,
      haidTerakhir: haid[jumlahData - 1] ?? null,
      prediksiMulai: null,
      prediksiSelesai: null,
      hariLagi: null,
      keterangan:
        'Catat minimal 2 siklus haid untuk mulai melihat prediksi otomatis.',
    };
  }

  // Pakai maksimal 6 siklus terakhir agar prediksi mengikuti pola terbaru.
  const recent = haid.slice(-7);
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const g = inclusiveDays(recent[i - 1], recent[i]) - 1; // selisih hari
    if (g > 0 && g <= 90) gaps.push(g); // buang outlier tak masuk akal
  }
  const rataSiklus = gaps.length
    ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
    : null;

  // Rata durasi dari periode haid yang punya tanggal selesai.
  const durations = periods
    .filter((p) => p.jenis === 'haid' && p.selesai)
    .map((p) => inclusiveDays(p.mulai, p.selesai as string))
    .filter((d) => d > 0 && d <= 15);
  const rataDurasi = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 7;

  const haidTerakhir = haid[haid.length - 1];
  let prediksiMulai: string | null = null;
  let prediksiSelesai: string | null = null;
  let hariLagi: number | null = null;
  if (rataSiklus) {
    prediksiMulai = addDaysIso(haidTerakhir, rataSiklus);
    prediksiSelesai = addDaysIso(prediksiMulai, Math.max(0, rataDurasi - 1));
    hariLagi = inclusiveDays(acuanIso, prediksiMulai) - 1;
  }

  let keterangan = `Berdasarkan ${gaps.length + 1} siklus terakhir, rata-rata siklusmu ${rataSiklus} hari.`;
  if (hariLagi !== null) {
    if (hariLagi < -3) {
      keterangan += ' Perkiraan sudah lewat — kemungkinan siklus lebih panjang bulan ini.';
    } else if (hariLagi <= 0) {
      keterangan += ' Perkiraan haid sekitar hari ini.';
    } else {
      keterangan += ` Perkiraan haid berikutnya ${hariLagi} hari lagi.`;
    }
  }

  return {
    cukupData: true,
    jumlahData,
    rataSiklus,
    rataDurasi,
    haidTerakhir,
    prediksiMulai,
    prediksiSelesai,
    hariLagi,
    keterangan,
  };
}

/**
 * Hitung berapa hari dari sebuah periode (mulai..selesai, inklusif) yang
 * jatuh di bulan Ramadhan (Hijriah bulan ke-9). Dipakai untuk menyarankan
 * jumlah qadha puasa otomatis saat user mencatat haid/nifas.
 * Periode yang masih berlangsung (selesai null) mengembalikan 0.
 */
export function ramadhanDaysInRange(
  mulaiIso: string,
  selesaiIso: string | null,
): number {
  if (!selesaiIso) return 0;
  const total = inclusiveDays(mulaiIso, selesaiIso);
  if (total <= 0 || total > 60) return 0; // guard input absurd
  let count = 0;
  for (let i = 0; i < total; i++) {
    const iso = addDaysIso(mulaiIso, i);
    const h = gregorianStringToHijri(iso);
    if (h.hijri.month === 9) count++;
  }
  return count;
}

/**
 * Idem, tapi dipecah per tahun Hijriah: `{ 1447: 5 }` = 5 hari periode ini
 * jatuh di Ramadhan 1447 H. Sebuah periode panjang bisa (secara teoretis)
 * menyentuh dua Ramadhan berbeda, jadi hasilnya map, bukan satu angka.
 * Periode yang masih berlangsung (`selesai=null`) mengembalikan map kosong —
 * hutangnya baru pasti setelah periode ditutup.
 */
export function ramadhanDaysByYear(
  mulaiIso: string,
  selesaiIso: string | null,
): Map<number, number> {
  const out = new Map<number, number>();
  if (!selesaiIso) return out;
  const total = inclusiveDays(mulaiIso, selesaiIso);
  if (total <= 0 || total > 60) return out; // guard input absurd
  for (let i = 0; i < total; i++) {
    const h = gregorianStringToHijri(addDaysIso(mulaiIso, i));
    if (h.hijri.month !== 9) continue;
    out.set(h.hijri.year, (out.get(h.hijri.year) ?? 0) + 1);
  }
  return out;
}

// ─── Ramadhan: tanggal, deadline qadha, fidyah ─────────────────────────

/** Tanggal Masehi (ISO) 1 Ramadhan pada tahun Hijriah `tahun`. */
export function ramadanMulaiIso(tahunHijriah: number): string {
  return hijriStringToGregorian(`${tahunHijriah}-09-01`).gregorian.iso;
}

export interface RamadanBerikutnya {
  tanggal: string; // ISO Masehi 1 Ramadhan berikutnya
  hariLagi: number; // selisih hari dari `acuan` (0 = hari ini)
  tahunHijriah: number;
}

/**
 * Ramadhan berikutnya relatif ke `acuanIso`: 1 Ramadhan pertama yang jatuh
 * pada atau sesudah tanggal acuan. Kalau acuan sedang di tengah Ramadhan,
 * yang dikembalikan adalah Ramadhan tahun berikutnya — itu memang deadline
 * qadha yang relevan (Ramadhan berjalan sudah tidak bisa dipakai mengqadha).
 *
 * Kalender yang dipakai = tabular Islamic (sama dengan seluruh app), jadi bisa
 * meleset ±1 hari dari rukyat lokal. Cukup untuk hitung mundur, bukan untuk
 * penetapan awal puasa.
 */
export function ramadanBerikutnya(
  acuanIso: string = jakartaTodayIso(),
): RamadanBerikutnya {
  const h = gregorianStringToHijri(acuanIso);
  // Mulai dari tahun Hijriah acuan, maju sampai 1 Ramadhan >= acuan.
  let tahun = h.hijri.year;
  let tanggal = ramadanMulaiIso(tahun);
  while (tanggal < acuanIso) {
    tahun += 1;
    tanggal = ramadanMulaiIso(tahun);
  }
  return {
    tanggal,
    hariLagi: inclusiveDays(acuanIso, tanggal) - 1,
    tahunHijriah: tahun,
  };
}

/**
 * Batas akhir mengqadha hutang Ramadhan `tahunHijriah` = sebelum masuk
 * Ramadhan berikutnya, yakni 1 Ramadhan tahun sesudahnya.
 */
export function deadlineQadha(tahunHijriah: number): string {
  return ramadanMulaiIso(tahunHijriah + 1);
}

export interface StatusKeterlambatan {
  deadline: string | null;
  terlambat: boolean;
  fidyahHari: number;
}

/**
 * Status keterlambatan sebuah entri qadha.
 *
 * Jumhur: menunda qadha sampai masuk Ramadhan berikutnya TANPA uzur → tetap
 * wajib qadha DITAMBAH fidyah 1 mud makanan pokok per hari yang tertunda.
 * `fidyahHari` di sini = sisa hari yang belum dibayar saat deadline terlewat
 * (heuristik indikatif — sebagian ulama mengalikan dengan jumlah tahun
 * penundaan, dan uzur yang berlanjut menggugurkan fidyah). Angka ini untuk
 * edukasi/pengingat, bukan penetapan; selalu tampilkan disclaimer.
 */
export function statusKeterlambatan(
  tahunHijriah: number | null,
  sisaHari: number,
  acuanIso: string = jakartaTodayIso(),
): StatusKeterlambatan {
  if (tahunHijriah === null) {
    return { deadline: null, terlambat: false, fidyahHari: 0 };
  }
  const deadline = deadlineQadha(tahunHijriah);
  const terlambat = sisaHari > 0 && acuanIso >= deadline;
  return { deadline, terlambat, fidyahHari: terlambat ? sisaHari : 0 };
}
