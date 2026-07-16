-- Artikel memakai master penulis bersama (SerambiAuthor). Saat dipilih, nama
-- disnapshot ke kolom `penulis`; authorId menyimpan referensi (SetNull saat
-- penulis dihapus agar artikel tetap ada).

ALTER TABLE "artikel" ADD COLUMN "authorId" TEXT;
CREATE INDEX "artikel_authorId_idx" ON "artikel"("authorId");
ALTER TABLE "artikel"
  ADD CONSTRAINT "artikel_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "serambi_authors"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
