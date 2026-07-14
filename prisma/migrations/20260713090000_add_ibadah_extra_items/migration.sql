-- Perluas checklist harian: tambah 3 item non-sholat (dzikir/tilawah/hafalan).
-- Additive & backward-compatible — kolom sholat lama tidak diubah.
ALTER TABLE "user_ibadah_daily" ADD COLUMN "dzikir" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_ibadah_daily" ADD COLUMN "tilawah" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_ibadah_daily" ADD COLUMN "hafalan" BOOLEAN NOT NULL DEFAULT false;
