/**
 * Pre-registered tafsir sources. The first entry (`kemenag`) is the legacy
 * default seeded from equran.id. Additional sources are fetched from
 * quran.com /api/v4/quran/tafsirs/:id during the `tafsir` extension seed.
 */
export interface TafsirSourceMeta {
  sumber: string;
  nama: string;
  bahasa: string;
  /** Resource id on api.quran.com. `null` for non-quran.com sources. */
  quranComId: number | null;
}

export const TAFSIR_SOURCES: TafsirSourceMeta[] = [
  {
    sumber: 'kemenag',
    nama: 'Kementerian Agama RI',
    bahasa: 'id',
    quranComId: null,
  },
  {
    sumber: 'ibn-kathir',
    nama: 'Tafsir Ibn Kathir (Arabic)',
    bahasa: 'ar',
    quranComId: 14,
  },
  {
    sumber: 'ibn-kathir-en',
    nama: 'Tafsir Ibn Kathir (abridged, English)',
    bahasa: 'en',
    quranComId: 169,
  },
  {
    sumber: 'muyassar',
    nama: 'Tafsir al-Muyassar (Arabic)',
    bahasa: 'ar',
    quranComId: 16,
  },
];
