/** Katalog amalan harian untuk habit tracker. Key dipakai di DB & frontend. */
export interface AmalanItem {
  key: string;
  label: string;
  grup: string;
}

export const AMALAN_CATALOG: AmalanItem[] = [
  { key: 'subuh', label: 'Subuh', grup: 'Sholat 5 Waktu' },
  { key: 'dzuhur', label: 'Dzuhur', grup: 'Sholat 5 Waktu' },
  { key: 'ashar', label: 'Ashar', grup: 'Sholat 5 Waktu' },
  { key: 'maghrib', label: 'Maghrib', grup: 'Sholat 5 Waktu' },
  { key: 'isya', label: 'Isya', grup: 'Sholat 5 Waktu' },
  { key: 'tilawah', label: 'Tilawah Al-Qur’an', grup: 'Al-Qur’an' },
  { key: 'dzikir_pagi', label: 'Dzikir Pagi', grup: 'Dzikir' },
  { key: 'dzikir_petang', label: 'Dzikir Petang', grup: 'Dzikir' },
  { key: 'istighfar', label: 'Istighfar', grup: 'Dzikir' },
  { key: 'sholat_sunnah', label: 'Sholat Sunnah', grup: 'Sunnah' },
  { key: 'sedekah', label: 'Sedekah', grup: 'Amal' },
  { key: 'doa', label: 'Doa harian', grup: 'Amal' },
];

export const AMALAN_KEYS = new Set(AMALAN_CATALOG.map((a) => a.key));
