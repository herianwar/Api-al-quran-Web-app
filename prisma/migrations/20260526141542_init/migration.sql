-- CreateTable
CREATE TABLE "surahs" (
    "id" SERIAL NOT NULL,
    "nomor" INTEGER NOT NULL,
    "nama" TEXT NOT NULL,
    "namaLatin" TEXT NOT NULL,
    "arti" TEXT NOT NULL,
    "jumlahAyat" INTEGER NOT NULL,
    "tempatTurun" TEXT NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "audioFullUrl" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surahs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ayat" (
    "id" SERIAL NOT NULL,
    "surahId" INTEGER NOT NULL,
    "nomorAyat" INTEGER NOT NULL,
    "teksArab" TEXT NOT NULL,
    "teksLatin" TEXT NOT NULL,
    "teksIndonesia" TEXT NOT NULL,
    "audioUrls" JSONB NOT NULL,

    CONSTRAINT "ayat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tafsir" (
    "id" SERIAL NOT NULL,
    "surahId" INTEGER NOT NULL,
    "sumber" TEXT NOT NULL DEFAULT 'kemenag',

    CONSTRAINT "tafsir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tafsir_ayat" (
    "id" SERIAL NOT NULL,
    "tafsirId" INTEGER NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "teks" TEXT NOT NULL,

    CONSTRAINT "tafsir_ayat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doa" (
    "id" SERIAL NOT NULL,
    "judul" TEXT NOT NULL,
    "arab" TEXT NOT NULL,
    "latin" TEXT NOT NULL,
    "terjemah" TEXT NOT NULL,
    "sumber" TEXT,
    "grup" TEXT,
    "tag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jadwal_sholat" (
    "id" SERIAL NOT NULL,
    "kotaId" TEXT NOT NULL,
    "namaKota" TEXT NOT NULL,
    "provinsi" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "imsak" TEXT NOT NULL,
    "subuh" TEXT NOT NULL,
    "terbit" TEXT NOT NULL,
    "dhuha" TEXT NOT NULL,
    "dzuhur" TEXT NOT NULL,
    "ashar" TEXT NOT NULL,
    "maghrib" TEXT NOT NULL,
    "isya" TEXT NOT NULL,

    CONSTRAINT "jadwal_sholat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kota" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "provinsi" TEXT NOT NULL,

    CONSTRAINT "kota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nama" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surahId" INTEGER NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hafalan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hafalan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seed_logs" (
    "id" SERIAL NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "doneItems" INTEGER NOT NULL DEFAULT 0,
    "errorMsg" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seed_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "surahs_nomor_key" ON "surahs"("nomor");

-- CreateIndex
CREATE INDEX "ayat_surahId_idx" ON "ayat"("surahId");

-- CreateIndex
CREATE UNIQUE INDEX "ayat_surahId_nomorAyat_key" ON "ayat"("surahId", "nomorAyat");

-- CreateIndex
CREATE UNIQUE INDEX "tafsir_surahId_sumber_key" ON "tafsir"("surahId", "sumber");

-- CreateIndex
CREATE INDEX "tafsir_ayat_ayatId_idx" ON "tafsir_ayat"("ayatId");

-- CreateIndex
CREATE UNIQUE INDEX "tafsir_ayat_tafsirId_ayatId_key" ON "tafsir_ayat"("tafsirId", "ayatId");

-- CreateIndex
CREATE INDEX "jadwal_sholat_kotaId_idx" ON "jadwal_sholat"("kotaId");

-- CreateIndex
CREATE UNIQUE INDEX "jadwal_sholat_kotaId_tanggal_key" ON "jadwal_sholat"("kotaId", "tanggal");

-- CreateIndex
CREATE INDEX "kota_provinsi_idx" ON "kota"("provinsi");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "bookmarks_userId_idx" ON "bookmarks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_userId_ayatId_key" ON "bookmarks"("userId", "ayatId");

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_userId_key" ON "reading_progress"("userId");

-- CreateIndex
CREATE INDEX "hafalan_userId_nextReviewAt_idx" ON "hafalan"("userId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "hafalan_userId_ayatId_key" ON "hafalan"("userId", "ayatId");

-- CreateIndex
CREATE UNIQUE INDEX "seed_logs_jobName_key" ON "seed_logs"("jobName");

-- AddForeignKey
ALTER TABLE "ayat" ADD CONSTRAINT "ayat_surahId_fkey" FOREIGN KEY ("surahId") REFERENCES "surahs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tafsir" ADD CONSTRAINT "tafsir_surahId_fkey" FOREIGN KEY ("surahId") REFERENCES "surahs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tafsir_ayat" ADD CONSTRAINT "tafsir_ayat_tafsirId_fkey" FOREIGN KEY ("tafsirId") REFERENCES "tafsir"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tafsir_ayat" ADD CONSTRAINT "tafsir_ayat_ayatId_fkey" FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_ayatId_fkey" FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hafalan" ADD CONSTRAINT "hafalan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hafalan" ADD CONSTRAINT "hafalan_ayatId_fkey" FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
