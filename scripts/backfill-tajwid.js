/**
 * One-off backfill: populate Ayat.teksArabTajwid for every ayat from the
 * Quran.com API v4 uthmani_tajweed dataset. Idempotent — safe to re-run.
 * Run: set -a; source .env; set +a; node scripts/backfill-tajwid.js
 */
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();
const BASE = 'https://api.quran.com/api/v4';
const TOTAL_SURAH = 114;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** <tajweed class=RULE>X</tajweed> -> <span class="tj tj-RULE">X</span>; drop verse-end numerals. */
function transformTajweed(html) {
  return html
    .replace(/<span class=end>.*?<\/span>/g, '')
    .replace(/<tajweed class=([a-z_]+)>/g, (_m, rule) => `<span class="tj tj-${rule}">`)
    .replace(/<\/tajweed>/g, '</span>')
    .trim();
}

async function fetchChapter(chapter) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data } = await axios.get(`${BASE}/quran/verses/uthmani_tajweed`, {
        params: { chapter_number: chapter, per_page: 300 },
        timeout: 30000,
        headers: { Accept: 'application/json', 'User-Agent': 'quran-api/1.0' },
      });
      return data.verses || [];
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1000 * attempt);
    }
  }
  return [];
}

async function main() {
  let updated = 0;
  let missing = 0;
  for (let nomor = 1; nomor <= TOTAL_SURAH; nomor++) {
    const surah = await prisma.surah.findUnique({ where: { nomor } });
    if (!surah) {
      console.warn(`[skip] surah ${nomor} not in DB`);
      continue;
    }
    const verses = await fetchChapter(nomor);
    let n = 0;
    for (const v of verses) {
      const ayat = Number(String(v.verse_key || '').split(':')[1]);
      if (!ayat || !v.text_uthmani_tajweed) continue;
      const tajwid = transformTajweed(v.text_uthmani_tajweed);
      try {
        await prisma.ayat.update({
          where: { surahId_nomorAyat: { surahId: surah.id, nomorAyat: ayat } },
          data: { teksArabTajwid: tajwid },
        });
        n++;
      } catch (e) {
        missing++;
      }
    }
    updated += n;
    console.log(`surah ${String(nomor).padStart(3)} (${surah.namaLatin}): ${n} ayat tajwid -> total ${updated}`);
    await sleep(200);
  }
  console.log(`\nDONE. updated=${updated} missing/skipped=${missing}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('FATAL', e);
  await prisma.$disconnect();
  process.exit(1);
});
