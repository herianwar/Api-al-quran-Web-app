-- Accelerate substring/ILIKE search on ayat text columns.
-- pg_trgm GIN indexes speed up LIKE '%term%' / ILIKE '%term%' queries on
-- 77k+ rows of ayat text. Works for Arabic, Latin transliteration and
-- Indonesian translation alike (trigrams are language-agnostic).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS ayat_teks_arab_trgm_idx
  ON "ayat" USING GIN ("teksArab" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ayat_teks_latin_trgm_idx
  ON "ayat" USING GIN ("teksLatin" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ayat_teks_indonesia_trgm_idx
  ON "ayat" USING GIN ("teksIndonesia" gin_trgm_ops);
