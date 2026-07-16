-- Master data penulis Serambi + referensi opsional dari post.
-- Admin memilih penulis (nama + avatar) alih-alih mengetik/upload berulang.

-- CreateTable
CREATE TABLE "serambi_authors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serambi_authors_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "serambi_authors_name_key" ON "serambi_authors"("name");
CREATE INDEX "serambi_authors_active_name_idx" ON "serambi_authors"("active", "name");

-- Referensi post → penulis (nullable, SetNull saat penulis dihapus)
ALTER TABLE "serambi_posts" ADD COLUMN "authorId" TEXT;
CREATE INDEX "serambi_posts_authorId_idx" ON "serambi_posts"("authorId");
ALTER TABLE "serambi_posts"
  ADD CONSTRAINT "serambi_posts_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "serambi_authors"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
