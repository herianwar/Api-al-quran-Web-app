-- CreateTable
CREATE TABLE "adzan" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "muadzin" TEXT,
    "lokasi" TEXT,
    "jenis" TEXT NOT NULL DEFAULT 'umum',
    "file" TEXT NOT NULL,
    "durasi" INTEGER,
    "ukuran" INTEGER,
    "sumberUrl" TEXT,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adzan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adzan_slug_key" ON "adzan"("slug");

-- CreateIndex
CREATE INDEX "adzan_urutan_idx" ON "adzan"("urutan");

-- CreateIndex
CREATE INDEX "adzan_jenis_idx" ON "adzan"("jenis");
