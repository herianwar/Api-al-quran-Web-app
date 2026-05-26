/**
 * Start point (surah nomor : ayat) of each of the 30 juz, plus a sentinel
 * marking the end of the Quran. Used to compute which ayat fall in a juz, since
 * equran.id v2 does not return juz metadata per ayat.
 */
export const JUZ_START: Array<{ surah: number; ayat: number }> = [
  { surah: 1, ayat: 1 }, // Juz 1
  { surah: 2, ayat: 142 }, // 2
  { surah: 2, ayat: 253 }, // 3
  { surah: 3, ayat: 93 }, // 4
  { surah: 4, ayat: 24 }, // 5
  { surah: 4, ayat: 148 }, // 6
  { surah: 5, ayat: 82 }, // 7
  { surah: 6, ayat: 111 }, // 8
  { surah: 7, ayat: 88 }, // 9
  { surah: 8, ayat: 41 }, // 10
  { surah: 9, ayat: 93 }, // 11
  { surah: 11, ayat: 6 }, // 12
  { surah: 12, ayat: 53 }, // 13
  { surah: 15, ayat: 1 }, // 14
  { surah: 17, ayat: 1 }, // 15
  { surah: 18, ayat: 75 }, // 16
  { surah: 21, ayat: 1 }, // 17
  { surah: 23, ayat: 1 }, // 18
  { surah: 25, ayat: 21 }, // 19
  { surah: 27, ayat: 56 }, // 20
  { surah: 29, ayat: 46 }, // 21
  { surah: 33, ayat: 31 }, // 22
  { surah: 36, ayat: 28 }, // 23
  { surah: 39, ayat: 32 }, // 24
  { surah: 41, ayat: 47 }, // 25
  { surah: 46, ayat: 1 }, // 26
  { surah: 51, ayat: 31 }, // 27
  { surah: 58, ayat: 1 }, // 28
  { surah: 67, ayat: 1 }, // 29
  { surah: 78, ayat: 1 }, // 30
  { surah: 115, ayat: 1 }, // sentinel (end of Quran)
];

/** The six qari available in equran.id v2 audio objects. */
export const QARI_LIST = [
  { id: '01', nama: 'Abdullah Al-Juhany' },
  { id: '02', nama: 'Abdul Muhsin Al-Qasim' },
  { id: '03', nama: 'Abdurrahman as-Sudais' },
  { id: '04', nama: 'Ibrahim Al-Dossari' },
  { id: '05', nama: 'Mishary Rashid Al-Afasy' },
  { id: '06', nama: 'Muhammad Ayyub' },
];
