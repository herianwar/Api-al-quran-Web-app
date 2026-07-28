/**
 * Katalog & analitik murni untuk catatan mood/gejala harian Muslimah.
 *
 * Tidak ada DB dan tidak ada NestJS di file ini — semuanya fungsi murni supaya
 * bisa diuji langsung, sama seperti muslimah.fiqh.ts.
 *
 * DISCLAIMER: keluaran `hitungInsight()` adalah pola statistik dari catatan
 * user sendiri, BUKAN diagnosis medis.
 */

import { addDaysIso, coversDate, inclusiveDays } from './muslimah.fiqh';

// ─── Katalog nilai yang diizinkan ──────────────────────────────────────

export const MOOD_VALUES = [
  'joyful',
  'calm',
  'neutral',
  'tired',
  'sad',
  'anxious',
  'angry',
] as const;
export type Mood = (typeof MOOD_VALUES)[number];

export const FLOW_VALUES = ['spotting', 'ringan', 'sedang', 'deras'] as const;
export type Flow = (typeof FLOW_VALUES)[number];

export const INTENSITAS_VALUES = ['ringan', 'sedang', 'berat'] as const;
export type Intensitas = (typeof INTENSITAS_VALUES)[number];

export interface SymptomItem {
  key: string;
  label: string;
}

export const SYMPTOM_CATALOG: SymptomItem[] = [
  { key: 'kram', label: 'Kram perut' },
  { key: 'sakit_kepala', label: 'Sakit kepala' },
  { key: 'lelah', label: 'Lelah' },
  { key: 'sensitif', label: 'Sensitif / mudah tersinggung' },
  { key: 'kembung', label: 'Kembung' },
  { key: 'nyeri_payudara', label: 'Nyeri payudara' },
  { key: 'sakit_pinggang', label: 'Sakit pinggang' },
  { key: 'jerawat', label: 'Jerawat' },
];

export const SYMPTOM_KEYS = new Set(SYMPTOM_CATALOG.map((s) => s.key));
export const MOOD_SET: ReadonlySet<string> = new Set(MOOD_VALUES);
export const FLOW_SET: ReadonlySet<string> = new Set(FLOW_VALUES);
export const INTENSITAS_SET: ReadonlySet<string> = new Set(INTENSITAS_VALUES);

// ─── Bentuk data ───────────────────────────────────────────────────────

export interface Symptom {
  key: string;
  intensitas: Intensitas | null;
}

export interface MoodRecord {
  tanggal: string; // YYYY-MM-DD
  mood: string | null;
  flow: string | null;
  symptoms: Symptom[];
}

export interface PeriodeRingkas {
  jenis: string;
  mulai: string;
  selesai: string | null;
}

/** Fase siklus sebuah tanggal, relatif terhadap periode haid user. */
export type Fase = 'praHaid' | 'haid' | 'suci';

/** Berapa hari sebelum `mulai` haid yang masih dihitung "pra-haid" (PMS). */
export const PRA_HAID_HARI = 5;

// ─── Fase & offset ─────────────────────────────────────────────────────

/**
 * Fase sebuah tanggal + offset harinya terhadap tanggal mulai haid terdekat.
 * Offset 0 = hari pertama haid, -2 = dua hari sebelum haid mulai, +3 = hari
 * keempat haid. `offset` null bila tidak ada periode haid yang cukup dekat
 * (di luar jendela -15..+15 hari) — supaya tanggal random tidak dipaksa
 * dikaitkan ke siklus yang jauh.
 */
export function faseTanggal(
  iso: string,
  periods: PeriodeRingkas[],
): { fase: Fase; offset: number | null } {
  const haid = periods.filter((p) => p.jenis === 'haid' || p.jenis === 'nifas');

  // Offset ke tanggal mulai haid TERDEKAT (bisa negatif = haid belum datang).
  let offset: number | null = null;
  for (const p of haid) {
    const d = inclusiveDays(p.mulai, iso) - 1; // >0 sesudah mulai, <0 sebelum
    if (Math.abs(d) > 15) continue;
    if (offset === null || Math.abs(d) < Math.abs(offset)) offset = d;
  }

  if (haid.some((p) => coversDate(p, iso))) return { fase: 'haid', offset };

  const praHaid = haid.some((p) => {
    const awalJendela = addDaysIso(p.mulai, -PRA_HAID_HARI);
    return iso >= awalJendela && iso < p.mulai;
  });
  return { fase: praHaid ? 'praHaid' : 'suci', offset };
}

// ─── Insight ───────────────────────────────────────────────────────────

export interface SymptomInsight {
  key: string;
  label: string;
  total: number;
  fase: Record<Fase, number>;
  /** Fase dengan frekuensi tertinggi (null bila seri/tidak ada data). */
  faseTersering: Fase | null;
  /** Offset hari (relatif mulai haid) yang paling sering muncul. */
  offsetTersering: number | null;
  /** Rentang offset yang mencakup mayoritas kemunculan, mis. -2..3. */
  rentangOffset: { dari: number; sampai: number } | null;
}

export interface MoodInsight {
  cukupData: boolean;
  jumlahCatatan: number;
  jumlahSiklus: number;
  symptomByPhase: SymptomInsight[];
  moodTrend: Record<Fase, Record<string, number>>;
  moodDominan: Record<Fase, string | null>;
  keterangan: string;
  disclaimer: string;
}

const DISCLAIMER =
  'Insight ini adalah pola statistik dari catatanmu sendiri, bukan diagnosis medis. Bila ada keluhan yang mengganggu atau tidak biasa, konsultasikan ke tenaga kesehatan.';

/** Insight kosong dengan alasan — dipakai saat data belum cukup. */
function belumCukup(
  jumlahCatatan: number,
  jumlahSiklus: number,
  keterangan: string,
): MoodInsight {
  return {
    cukupData: false,
    jumlahCatatan,
    jumlahSiklus,
    symptomByPhase: [],
    moodTrend: { praHaid: {}, haid: {}, suci: {} },
    moodDominan: { praHaid: null, haid: null, suci: null },
    keterangan,
    disclaimer: DISCLAIMER,
  };
}

/**
 * Nilai dengan hitungan tertinggi. Mengembalikan null bila tidak ada data ATAU
 * puncaknya seri — lebih jujur menampilkan "belum menentu" di app daripada
 * memilih pemenang sembarangan dari urutan Map.
 */
function puncak<T extends string | number>(counts: Map<T, number>): T | null {
  let best: T | null = null;
  let bestN = 0;
  let seri = false;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
      seri = false;
    } else if (n === bestN && n > 0) {
      seri = true;
    }
  }
  if (bestN === 0 || seri) return null;
  return best;
}

/**
 * Hitung insight dari catatan mood user + riwayat haid-nya.
 *
 * Butuh minimal `minSiklus` periode haid tercatat; di bawah itu polanya belum
 * berarti apa-apa dan kita kembalikan `cukupData: false` (kontrak yang dipakai
 * app untuk menampilkan empty-state, bukan grafik kosong yang menyesatkan).
 */
export function hitungInsight(
  records: MoodRecord[],
  periods: PeriodeRingkas[],
  minSiklus = 2,
): MoodInsight {
  const siklus = periods.filter((p) => p.jenis === 'haid').length;
  if (siklus < minSiklus) {
    return belumCukup(
      records.length,
      siklus,
      `Catat minimal ${minSiklus} siklus haid untuk mulai melihat pola gejala & mood.`,
    );
  }
  if (records.length === 0) {
    return belumCukup(
      0,
      siklus,
      'Belum ada catatan mood/gejala yang bisa dianalisis.',
    );
  }

  const faseCounts = new Map<string, Map<Fase, number>>();
  const offsetCounts = new Map<string, Map<number, number>>();
  const totals = new Map<string, number>();
  const moodTrend: Record<Fase, Record<string, number>> = {
    praHaid: {},
    haid: {},
    suci: {},
  };

  for (const r of records) {
    const { fase, offset } = faseTanggal(r.tanggal, periods);

    if (r.mood) {
      moodTrend[fase][r.mood] = (moodTrend[fase][r.mood] ?? 0) + 1;
    }

    for (const s of r.symptoms) {
      totals.set(s.key, (totals.get(s.key) ?? 0) + 1);

      if (!faseCounts.has(s.key)) faseCounts.set(s.key, new Map());
      const fc = faseCounts.get(s.key) as Map<Fase, number>;
      fc.set(fase, (fc.get(fase) ?? 0) + 1);

      if (offset !== null) {
        if (!offsetCounts.has(s.key)) offsetCounts.set(s.key, new Map());
        const oc = offsetCounts.get(s.key) as Map<number, number>;
        oc.set(offset, (oc.get(offset) ?? 0) + 1);
      }
    }
  }

  const symptomByPhase: SymptomInsight[] = [];
  for (const item of SYMPTOM_CATALOG) {
    const total = totals.get(item.key) ?? 0;
    if (total === 0) continue; // jangan kirim gejala yang tak pernah dicatat
    const fc = faseCounts.get(item.key) ?? new Map<Fase, number>();
    const oc = offsetCounts.get(item.key) ?? new Map<number, number>();
    const offsets = [...oc.keys()].sort((a, b) => a - b);

    symptomByPhase.push({
      key: item.key,
      label: item.label,
      total,
      fase: {
        praHaid: fc.get('praHaid') ?? 0,
        haid: fc.get('haid') ?? 0,
        suci: fc.get('suci') ?? 0,
      },
      faseTersering: puncak(fc),
      offsetTersering: puncak(oc),
      rentangOffset: offsets.length
        ? { dari: offsets[0], sampai: offsets[offsets.length - 1] }
        : null,
    });
  }
  symptomByPhase.sort((a, b) => b.total - a.total);

  const moodDominan = {
    praHaid: puncak(new Map(Object.entries(moodTrend.praHaid))),
    haid: puncak(new Map(Object.entries(moodTrend.haid))),
    suci: puncak(new Map(Object.entries(moodTrend.suci))),
  };

  const teratas = symptomByPhase[0];
  const keterangan = teratas
    ? `Dari ${records.length} catatan & ${siklus} siklus, gejala paling sering kamu rasakan adalah "${teratas.label}" (${teratas.total}x), terbanyak saat fase ${teratas.faseTersering ?? 'tidak menentu'}.`
    : `Dari ${records.length} catatan & ${siklus} siklus, belum ada gejala yang tercatat.`;

  return {
    cukupData: true,
    jumlahCatatan: records.length,
    jumlahSiklus: siklus,
    symptomByPhase,
    moodTrend,
    moodDominan,
    keterangan,
    disclaimer: DISCLAIMER,
  };
}
