-- AlterTable
ALTER TABLE "ayat" ADD COLUMN     "halaman" INTEGER,
ADD COLUMN     "juz" INTEGER;

-- CreateIndex
CREATE INDEX "ayat_halaman_idx" ON "ayat"("halaman");

-- CreateIndex
CREATE INDEX "ayat_juz_idx" ON "ayat"("juz");
