




-- AlterTable
ALTER TABLE "asmaul_husna" ADD COLUMN     "dalil" TEXT,
ADD COLUMN     "faidah" TEXT,
ADD COLUMN     "penjelasan" TEXT;

-- AlterTable
ALTER TABLE "doa" ADD COLUMN     "hitungan" INTEGER,
ADD COLUMN     "urutan" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "nabi" (
    "id" SERIAL NOT NULL,
    "urutan" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "namaArab" TEXT NOT NULL,
    "gelar" TEXT,
    "periode" TEXT,
    "ringkasan" TEXT NOT NULL,
    "kisah" TEXT NOT NULL,
    "ayatRujukan" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nabi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sirah" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "periode" TEXT,
    "isi" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sirah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khutbah" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "tema" TEXT,
    "tanggal" TIMESTAMP(3),
    "isi" TEXT NOT NULL,
    "pembuka" TEXT,
    "penutup" TEXT,
    "sumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khutbah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hadis_qudsi" (
    "id" SERIAL NOT NULL,
    "nomor" INTEGER NOT NULL,
    "judul" TEXT,
    "arab" TEXT NOT NULL,
    "terjemahan" TEXT NOT NULL,
    "sumber" TEXT,
    "kitab" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hadis_qudsi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ayat_kata" (
    "id" SERIAL NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "posisi" INTEGER NOT NULL,
    "arab" TEXT NOT NULL,
    "transliterasi" TEXT,
    "arti" TEXT NOT NULL,

    CONSTRAINT "ayat_kata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ayat_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "judul" TEXT,
    "body" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ayat_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tanggal" TEXT NOT NULL,
    "ayatCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'ayat',
    "target" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nabi_urutan_key" ON "nabi"("urutan");

-- CreateIndex
CREATE UNIQUE INDEX "nabi_slug_key" ON "nabi"("slug");

-- CreateIndex
CREATE INDEX "nabi_urutan_idx" ON "nabi"("urutan");

-- CreateIndex
CREATE UNIQUE INDEX "sirah_slug_key" ON "sirah"("slug");

-- CreateIndex
CREATE INDEX "sirah_urutan_idx" ON "sirah"("urutan");

-- CreateIndex
CREATE UNIQUE INDEX "khutbah_slug_key" ON "khutbah"("slug");

-- CreateIndex
CREATE INDEX "khutbah_tema_idx" ON "khutbah"("tema");

-- CreateIndex
CREATE INDEX "khutbah_tanggal_idx" ON "khutbah"("tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "hadis_qudsi_nomor_key" ON "hadis_qudsi"("nomor");

-- CreateIndex
CREATE INDEX "ayat_kata_ayatId_idx" ON "ayat_kata"("ayatId");

-- CreateIndex
CREATE UNIQUE INDEX "ayat_kata_ayatId_posisi_key" ON "ayat_kata"("ayatId", "posisi");

-- CreateIndex
CREATE INDEX "ayat_notes_userId_createdAt_idx" ON "ayat_notes"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ayat_notes_ayatId_idx" ON "ayat_notes"("ayatId");

-- CreateIndex
CREATE INDEX "reading_sessions_userId_tanggal_idx" ON "reading_sessions"("userId", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "reading_sessions_userId_tanggal_key" ON "reading_sessions"("userId", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "reading_goals_userId_key" ON "reading_goals"("userId");

-- CreateIndex
CREATE INDEX "doa_grup_urutan_idx" ON "doa"("grup", "urutan");

-- AddForeignKey
ALTER TABLE "ayat_kata" ADD CONSTRAINT "ayat_kata_ayatId_fkey" FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ayat_notes" ADD CONSTRAINT "ayat_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ayat_notes" ADD CONSTRAINT "ayat_notes_ayatId_fkey" FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_goals" ADD CONSTRAINT "reading_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

