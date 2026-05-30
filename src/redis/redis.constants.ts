/** Redis TTL (seconds) per data type. */
export const CacheTtl = {
  SURAH_LIST: 60 * 60 * 24 * 7, // 7 days
  SURAH_DETAIL: 60 * 60 * 24 * 7,
  AYAT: 60 * 60 * 24 * 7,
  TAFSIR: 60 * 60 * 24 * 7,
  DOA: 60 * 60 * 24 * 7,
  JADWAL_SHOLAT: 60 * 60 * 24 * 30, // 30 days
  USER_DATA: 60 * 5, // 5 minutes
} as const;

/** Centralised cache key builders. */
export const CacheKey = {
  surahList: () => 'surah:list',
  surahDetail: (nomor: number | string) => `surah:detail:${nomor}`,
  ayat: (surahId: number | string, nomorAyat: number | string) =>
    `ayat:${surahId}:${nomorAyat}`,
  juz: (nomor: number | string) => `juz:${nomor}`,
  halaman: (nomor: number | string) => `halaman:${nomor}`,
  tafsir: (surahId: number | string) => `tafsir:${surahId}`,
  doaAll: () => 'doa:all',
  doaDetail: (id: number | string) => `doa:detail:${id}`,
  jadwal: (kotaId: string, bulan: number | string, tahun: number | string) =>
    `jadwal:${kotaId}:${bulan}:${tahun}`,
  provinsiList: () => 'sholat:provinsi',
  kotaList: (provinsi: string) => `sholat:kota:${provinsi}`,
} as const;
