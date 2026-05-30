/**
 * Pre-registered translation sources. New entries can be added without code
 * changes elsewhere — the seeder iterates this list. `quranComId` is the
 * numeric resource id used by api.quran.com/api/v4/quran/translations/:id.
 */
export interface TranslationSource {
  /** Slug used as DB row + URL path. */
  sumber: string;
  bahasa: string;
  penerjemah: string;
  /** Resource id on api.quran.com (https://quran.com/api/translations). */
  quranComId: number;
}

export const TRANSLATION_SOURCES: TranslationSource[] = [
  {
    sumber: 'sahih-international',
    bahasa: 'en',
    penerjemah: 'Saheeh International',
    quranComId: 20,
  },
  {
    sumber: 'pickthall',
    bahasa: 'en',
    penerjemah: 'Mohammed Marmaduke William Pickthall',
    quranComId: 19,
  },
  {
    sumber: 'kemenag-2019',
    bahasa: 'id',
    penerjemah: 'Kementerian Agama RI (2019)',
    quranComId: 33,
  },
];
