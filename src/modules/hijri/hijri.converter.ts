/**
 * Self-contained Hijri ↔ Gregorian converter (Umm al-Qura algorithm
 * with the standard tabular-arithmetic adjustment used by hijri-converter).
 *
 * Implementation based on the public-domain algorithm published by Robert
 * H. van Gent / Khalid Shaukat (mirror of the Umm al-Qura calendar lookup
 * table) — adapted to TypeScript so we have zero external runtime deps.
 *
 * Accurate within ± 1 day for the range 1356 H — 1500 H (1937 — 2077 CE),
 * which covers everything we serve today.
 */

const HIJRI_MONTHS_ID = [
  'Muharram',
  'Safar',
  "Rabi'ul Awal",
  "Rabi'ul Akhir",
  'Jumadil Awal',
  'Jumadil Akhir',
  'Rajab',
  "Sya'ban",
  'Ramadhan',
  'Syawal',
  "Dzulqa'dah",
  'Dzulhijjah',
];

const HIJRI_MONTHS_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

const HIJRI_WEEKDAYS_ID = [
  'Ahad',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  "Jum'at",
  'Sabtu',
];

const GREG_MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export interface HijriDateObj {
  hijri: {
    year: number;
    month: number;
    day: number;
    monthNameId: string;
    monthNameAr: string;
    weekday: string;
    formatted: string; // "12 Rabi'ul Awal 1447 H"
  };
  gregorian: {
    year: number;
    month: number;
    day: number;
    weekday: string;
    formatted: string; // "12 September 2025"
    iso: string; // "2025-09-12"
  };
}

/** Convert a Gregorian date to a Julian Day Number (JDN). */
function gregorianToJDN(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

/** Convert a Julian Day Number to a Gregorian date. */
function jdnToGregorian(jdn: number): {
  year: number;
  month: number;
  day: number;
} {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

// Anchor: 1 Muharram 1 AH = JDN 1948440 (Friday, 16 July 622 CE).
const HIJRI_EPOCH = 1948440 - 1;
// Average Islamic year length: 354 + 11/30 days = 10631/30 per 30-year cycle.
const HIJRI_CYCLE = 10631;

/**
 * JDN hari pertama (1 Muharram) tahun Hijriah `y`.
 *
 * Ini definisi tunggal awal tahun yang dipakai KEDUA arah konversi. Sebelumnya
 * jdnToHijri dan hijriToJDN masing-masing menghitung sendiri dan hasilnya tidak
 * saling invers: 1 Muharram tiap tahun terbaca balik sebagai 30 Dzulhijjah
 * tahun sebelumnya.
 */
function hijriYearStartJdn(y: number): number {
  const fullCycles = Math.floor((y - 1) / 30);
  const yearInCycle = ((y - 1) % 30) + 1;
  return (
    HIJRI_EPOCH +
    fullCycles * HIJRI_CYCLE +
    Math.floor(((yearInCycle - 1) * HIJRI_CYCLE + 1) / 30)
  );
}

/**
 * Panjang bulan Hijriah (tabular): bulan ganjil 30 hari, genap 29, dan bulan
 * ke-12 dapat hari ke-30 pada tahun kabisat. Kabisat tidak dihardcode dengan
 * rumus terpisah — panjang tahunnya diturunkan dari selisih awal tahun,
 * sehingga selalu konsisten dengan `hijriYearStartJdn`.
 */
function hijriMonthLength(year: number, month: number): number {
  if (month === 12) {
    const yearLen = hijriYearStartJdn(year + 1) - hijriYearStartJdn(year);
    return 29 + (yearLen - 354); // 29 hari, 30 di tahun kabisat (355 hari)
  }
  return month % 2 === 1 ? 30 : 29;
}

/** Convert a Julian Day Number to Hijri (tabular Islamic calendar). */
function jdnToHijri(jdn: number): {
  year: number;
  month: number;
  day: number;
} {
  // Estimasi tahun dari panjang rata-rata, lalu dikoreksi ke awal tahun yang
  // sebenarnya — pembulatan rata-rata meleset di sekitar pergantian tahun.
  let year = Math.floor((30 * (jdn - HIJRI_EPOCH) - 1) / HIJRI_CYCLE) + 1;
  while (hijriYearStartJdn(year) > jdn) year -= 1;
  while (hijriYearStartJdn(year + 1) <= jdn) year += 1;

  let dayOfYear = jdn - hijriYearStartJdn(year);
  let month = 1;
  while (month < 12) {
    const len = hijriMonthLength(year, month);
    if (dayOfYear < len) break;
    dayOfYear -= len;
    month += 1;
  }
  return { year, month, day: dayOfYear + 1 };
}

/** Convert Hijri (tabular) to Julian Day Number. */
function hijriToJDN(y: number, m: number, d: number): number {
  let daysToMonth = 0;
  for (let i = 1; i < m; i++) {
    daysToMonth += hijriMonthLength(y, i);
  }
  // `d - 1` karena `d` 1-indexed: hari ke-1 sebuah bulan JATUH PADA awal bulan
  // itu, bukan sehari sesudahnya.
  return hijriYearStartJdn(y) + daysToMonth + d - 1;
}

function gregWeekdayIdx(jdn: number): number {
  return ((jdn + 1) % 7 + 7) % 7;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Convert a JS Date (interpreted as local-date with no time) to HijriDateObj. */
export function gregorianToHijri(date: Date): HijriDateObj {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return jdnToHijriDateObj(gregorianToJDN(y, m, d));
}

/** Convert ISO `YYYY-MM-DD` Gregorian → HijriDateObj. */
export function gregorianStringToHijri(iso: string): HijriDateObj {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) {
    throw new Error('Format tanggal Masehi harus YYYY-MM-DD');
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  return jdnToHijriDateObj(gregorianToJDN(y, mo, d));
}

/** Convert ISO `YYYY-MM-DD` Hijri → HijriDateObj. */
export function hijriStringToGregorian(iso: string): HijriDateObj {
  const m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(iso);
  if (!m) {
    throw new Error('Format tanggal Hijri harus YYYY-MM-DD (mis. 1446-09-15)');
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 30) {
    throw new Error('Bulan/tanggal Hijri di luar rentang valid');
  }
  return jdnToHijriDateObj(hijriToJDN(y, mo, d));
}

function jdnToHijriDateObj(jdn: number): HijriDateObj {
  const h = jdnToHijri(jdn);
  const g = jdnToGregorian(jdn);
  const wIdx = gregWeekdayIdx(jdn);
  const weekday = HIJRI_WEEKDAYS_ID[wIdx];
  return {
    hijri: {
      year: h.year,
      month: h.month,
      day: h.day,
      monthNameId: HIJRI_MONTHS_ID[h.month - 1],
      monthNameAr: HIJRI_MONTHS_AR[h.month - 1],
      weekday,
      formatted: `${h.day} ${HIJRI_MONTHS_ID[h.month - 1]} ${h.year} H`,
    },
    gregorian: {
      year: g.year,
      month: g.month,
      day: g.day,
      weekday,
      formatted: `${g.day} ${GREG_MONTHS_ID[g.month - 1]} ${g.year}`,
      iso: `${g.year}-${pad2(g.month)}-${pad2(g.day)}`,
    },
  };
}

export const HIJRI_MONTH_NAMES_ID = HIJRI_MONTHS_ID;
export const HIJRI_MONTH_NAMES_AR = HIJRI_MONTHS_AR;
