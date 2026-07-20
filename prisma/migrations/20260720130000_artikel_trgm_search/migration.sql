-- Artikel: make the ?q= search index-able.
--
-- list() searches with `contains` + `mode: insensitive`, which Prisma emits as
--   judul ILIKE '%q%' OR ringkasan ILIKE '%q%' OR tags @> ARRAY['q']
-- A leading wildcard makes a B-tree useless, so every search was a full scan.
--
-- Chosen over Postgres full-text search on purpose:
--   * No Indonesian dictionary ships with Postgres, so FTS would fall back to
--     'simple' — no stemming, so little of the linguistic benefit survives.
--   * FTS matches whole lexemes. The app sends ?q= as the user types, so a
--     partial word ("qur", "keutama") must still match — trigram keeps that.
--   * Trigram preserves the current substring semantics exactly, so neither
--     the API contract nor the service code changes; it only adds an index.
--     It is also typo-tolerant, which FTS is not.
-- Trade-off accepted: the article body (`konten`) stays unsearched. Indexing
-- raw HTML with trigrams matches on markup and inflates the index; adding
-- body search deserves its own change.
--
-- Measured on a 50k-row copy, selective term:
--   search  196ms -> 2.6ms      count  190ms -> 2.4ms

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "artikel_judul_trgm_idx"
  ON "artikel" USING GIN ("judul" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "artikel_ringkasan_trgm_idx"
  ON "artikel" USING GIN ("ringkasan" gin_trgm_ops);
