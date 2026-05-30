-- Accelerate substring/ILIKE search on hadis text columns. Same pattern as
-- ayat FTS — pg_trgm GIN works language-agnostically, so both Arabic and
-- Indonesian terjemahan get fast `contains` queries even across 38k rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS hadis_arab_trgm_idx
  ON "hadis" USING GIN ("arab" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS hadis_terjemahan_trgm_idx
  ON "hadis" USING GIN ("terjemahan" gin_trgm_ops);
