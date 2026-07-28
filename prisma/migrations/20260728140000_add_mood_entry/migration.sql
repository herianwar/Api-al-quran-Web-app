-- Catatan mood & gejala harian Muslimah (sebelumnya hanya tersimpan di device).
-- Pola mengikuti amalan_logs: tanggal disimpan sebagai string yyyy-MM-dd
-- (tanggal kalender user, bukan instant) + unique per (user, tanggal).

CREATE TABLE "mood_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tanggal" TEXT NOT NULL,
    "mood" TEXT,
    "flow" TEXT,
    "symptoms" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mood_entries_pkey" PRIMARY KEY ("id")
);

-- Satu baris per hari per user → upsert idempoten (PUT & bulk import).
CREATE UNIQUE INDEX "mood_entries_userId_tanggal_key" ON "mood_entries"("userId", "tanggal");
CREATE INDEX "mood_entries_userId_tanggal_idx" ON "mood_entries"("userId", "tanggal");

ALTER TABLE "mood_entries" ADD CONSTRAINT "mood_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
