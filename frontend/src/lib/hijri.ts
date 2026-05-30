/**
 * Self-contained Hijri ↔ Gregorian converter for client-side rendering.
 * Mirrors the algorithm used in src/modules/hijri/hijri.converter.ts on the
 * backend (tabular Islamic calendar). Used to show the Hijri date instantly
 * on the homepage without an extra API round-trip.
 */

export const HIJRI_MONTHS_ID = [
  "Muharram",
  "Safar",
  "Rabi'ul Awal",
  "Rabi'ul Akhir",
  "Jumadil Awal",
  "Jumadil Akhir",
  "Rajab",
  "Sya'ban",
  "Ramadhan",
  "Syawal",
  "Dzulqa'dah",
  "Dzulhijjah",
];

export const HIJRI_MONTHS_AR = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];

export const HIJRI_WEEKDAYS_ID = [
  "Ahad",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jum'at",
  "Sabtu",
];

const GREG_MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

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

function jdnToHijri(jdn: number): {
  year: number;
  month: number;
  day: number;
} {
  const epoch = 1948440 - 1;
  const days = jdn - epoch;
  const cycle = 10631;
  const yearCycle = Math.floor((30 * days - 1) / cycle);
  const yearInCycle = yearCycle + 1;
  const dayOfYearStart = epoch + Math.floor((yearCycle * cycle + 1) / 30);
  let dayOfYear = jdn - dayOfYearStart;
  let month = 1;
  while (month <= 12) {
    const len = month % 2 === 1 ? 30 : 29;
    if (dayOfYear < len) break;
    dayOfYear -= len;
    month += 1;
  }
  if (month > 12) {
    month = 12;
    dayOfYear = 29;
  }
  return { year: yearInCycle, month, day: dayOfYear + 1 };
}

function hijriToJDN(y: number, m: number, d: number): number {
  const epoch = 1948440 - 1;
  const cycle = 10631;
  const fullCycles = Math.floor((y - 1) / 30);
  const yearInCycle = ((y - 1) % 30) + 1;
  const daysToYearStart =
    fullCycles * cycle + Math.floor(((yearInCycle - 1) * cycle + 1) / 30);
  let daysToMonth = 0;
  for (let i = 1; i < m; i++) {
    daysToMonth += i % 2 === 1 ? 30 : 29;
  }
  return epoch + daysToYearStart + daysToMonth + d;
}

function weekdayIdx(jdn: number): number {
  return ((jdn + 1) % 7 + 7) % 7;
}

export interface HijriResult {
  hijri: {
    year: number;
    month: number;
    day: number;
    monthNameId: string;
    monthNameAr: string;
    weekday: string;
    formatted: string;
  };
  gregorian: {
    year: number;
    month: number;
    day: number;
    weekday: string;
    formatted: string;
    iso: string;
  };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function jdnToResult(jdn: number): HijriResult {
  const h = jdnToHijri(jdn);
  const g = jdnToGregorian(jdn);
  const weekday = HIJRI_WEEKDAYS_ID[weekdayIdx(jdn)];
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

export function gregorianToHijri(date: Date): HijriResult {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return jdnToResult(gregorianToJDN(y, m, d));
}

export function hijriToGregorian(
  year: number,
  month: number,
  day: number,
): HijriResult {
  return jdnToResult(hijriToJDN(year, month, day));
}

export function hijriToday(): HijriResult {
  return gregorianToHijri(new Date());
}
