-- Qadha puasa otomatis dari periode haid/nifas yang beririsan Ramadhan.
-- Kolom baru bersifat tambahan: baris lama tetap valid (otomatis=false,
-- ramadanTahun/haidPeriodeId NULL) sehingga klien lama tidak terpengaruh.

ALTER TABLE "qadha_puasa" ADD COLUMN "otomatis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "qadha_puasa" ADD COLUMN "ramadanTahun" INTEGER;
ALTER TABLE "qadha_puasa" ADD COLUMN "haidPeriodeId" TEXT;

-- Kunci idempotensi recompute. Baris manual punya ramadanTahun & haidPeriodeId
-- NULL; di Postgres NULL tidak pernah sama dengan NULL, jadi baris manual tidak
-- saling bentrok dan tidak ikut terkunci oleh index ini.
CREATE UNIQUE INDEX "qadha_puasa_userId_ramadanTahun_haidPeriodeId_key"
    ON "qadha_puasa"("userId", "ramadanTahun", "haidPeriodeId");
CREATE INDEX "qadha_puasa_haidPeriodeId_idx" ON "qadha_puasa"("haidPeriodeId");

-- ON DELETE SET NULL: menghapus periode haid tidak boleh menghapus riwayat
-- pembayaran (lunas). Penyesuaian jumlah dilakukan eksplisit di service.
ALTER TABLE "qadha_puasa" ADD CONSTRAINT "qadha_puasa_haidPeriodeId_fkey"
    FOREIGN KEY ("haidPeriodeId") REFERENCES "haid_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
