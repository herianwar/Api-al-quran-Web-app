





-- AlterTable
ALTER TABLE "ayat" ADD COLUMN     "sajdah" TEXT;

-- AlterTable

-- CreateTable
CREATE TABLE "niat_shalat" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "arab" TEXT NOT NULL,
    "latin" TEXT NOT NULL,
    "arti" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "niat_shalat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bacaan_shalat" (
    "id" SERIAL NOT NULL,
    "gerakan" INTEGER NOT NULL,
    "nama" TEXT NOT NULL,
    "varian" INTEGER NOT NULL DEFAULT 1,
    "arab" TEXT NOT NULL,
    "latin" TEXT NOT NULL,
    "arti" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bacaan_shalat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tahlil" (
    "id" SERIAL NOT NULL,
    "urutan" INTEGER NOT NULL,
    "judul" TEXT NOT NULL,
    "arab" TEXT NOT NULL,
    "latin" TEXT,
    "arti" TEXT NOT NULL,
    "hitungan" INTEGER,
    "jenis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tahlil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "niat_shalat_slug_key" ON "niat_shalat"("slug");

-- CreateIndex
CREATE INDEX "niat_shalat_urutan_idx" ON "niat_shalat"("urutan");

-- CreateIndex
CREATE INDEX "bacaan_shalat_gerakan_idx" ON "bacaan_shalat"("gerakan");

-- CreateIndex
CREATE UNIQUE INDEX "bacaan_shalat_gerakan_varian_key" ON "bacaan_shalat"("gerakan", "varian");

-- CreateIndex
CREATE UNIQUE INDEX "tahlil_urutan_key" ON "tahlil"("urutan");

-- CreateIndex
CREATE INDEX "tahlil_urutan_idx" ON "tahlil"("urutan");

-- CreateIndex
CREATE INDEX "tahlil_jenis_idx" ON "tahlil"("jenis");

-- CreateIndex
CREATE INDEX "ayat_sajdah_idx" ON "ayat"("sajdah");

