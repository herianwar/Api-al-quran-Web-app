-- Multi-translation table: one row per (ayat × source)
CREATE TABLE "translations" (
    "id" SERIAL NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "bahasa" TEXT NOT NULL,
    "sumber" TEXT NOT NULL,
    "penerjemah" TEXT,
    "teks" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "translations_ayatId_sumber_key" ON "translations"("ayatId", "sumber");
CREATE INDEX "translations_sumber_idx" ON "translations"("sumber");
CREATE INDEX "translations_bahasa_idx" ON "translations"("bahasa");

ALTER TABLE "translations" ADD CONSTRAINT "translations_ayatId_fkey"
    FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Asbabun Nuzul (historical context per ayat)
CREATE TABLE "asbabun_nuzul" (
    "id" SERIAL NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "teks" TEXT NOT NULL,
    "sumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asbabun_nuzul_pkey" PRIMARY KEY ("id")
);

-- Allow multiple sources per ayat (e.g. Wahidi + Lubabun Nuqul)
CREATE UNIQUE INDEX "asbabun_nuzul_ayatId_sumber_key" ON "asbabun_nuzul"("ayatId", "sumber");
CREATE INDEX "asbabun_nuzul_ayatId_idx" ON "asbabun_nuzul"("ayatId");

ALTER TABLE "asbabun_nuzul" ADD CONSTRAINT "asbabun_nuzul_ayatId_fkey"
    FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
