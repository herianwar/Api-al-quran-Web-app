




-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "category" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ayat_embeddings" (
    "ayatId" INTEGER NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ayat_embeddings_pkey" PRIMARY KEY ("ayatId")
);

-- CreateIndex
CREATE INDEX "app_settings_category_idx" ON "app_settings"("category");

-- CreateIndex
CREATE INDEX "ayat_embeddings_model_idx" ON "ayat_embeddings"("model");

-- AddForeignKey
ALTER TABLE "ayat_embeddings" ADD CONSTRAINT "ayat_embeddings_ayatId_fkey" FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── pgvector setup ─────────────────────────────────────────────────
-- Extension must be enabled by a superuser BEFORE this migration runs.
-- See README §AI section: `CREATE EXTENSION IF NOT EXISTS vector` once.
-- ────────────────────────────────────────────────────────────────────

-- Add the actual embedding column (Prisma can't represent `vector` type yet).
-- 1536 = output dim of OpenAI text-embedding-3-small. If a different model
-- is configured later with a different dim, the column needs to be re-ALTERed
-- and embeddings re-seeded.
ALTER TABLE "ayat_embeddings" ADD COLUMN "embedding" vector(1536);

-- HNSW index on cosine distance: best balance of accuracy + speed for the
-- expected workload (6.2k rows; 1536 dims; thousands of queries/day).
-- m=16, ef_construction=64 are conservative defaults — tunable later.
CREATE INDEX "ayat_embeddings_vector_idx"
  ON "ayat_embeddings"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
