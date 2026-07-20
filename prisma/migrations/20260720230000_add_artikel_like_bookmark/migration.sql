-- Artikel like & bookmark tersinkron per akun.
-- Mengikuti pola serambi_likes: join table @@unique + FK cascade ke users &
-- artikel, index userId. likeCount publik disimpan di kolom artikel.

-- Counter like publik (analog kolom views).
ALTER TABLE "artikel" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;

-- Like per-user (idempoten via unique).
CREATE TABLE "artikel_likes" (
    "id" TEXT NOT NULL,
    "artikelId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artikel_likes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "artikel_likes_artikelId_userId_key" ON "artikel_likes"("artikelId", "userId");
CREATE INDEX "artikel_likes_userId_idx" ON "artikel_likes"("userId");
ALTER TABLE "artikel_likes" ADD CONSTRAINT "artikel_likes_artikelId_fkey"
    FOREIGN KEY ("artikelId") REFERENCES "artikel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artikel_likes" ADD CONSTRAINT "artikel_likes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bookmark per-user (privat, tanpa counter).
CREATE TABLE "artikel_bookmarks" (
    "id" TEXT NOT NULL,
    "artikelId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artikel_bookmarks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "artikel_bookmarks_artikelId_userId_key" ON "artikel_bookmarks"("artikelId", "userId");
CREATE INDEX "artikel_bookmarks_userId_idx" ON "artikel_bookmarks"("userId");
ALTER TABLE "artikel_bookmarks" ADD CONSTRAINT "artikel_bookmarks_artikelId_fkey"
    FOREIGN KEY ("artikelId") REFERENCES "artikel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artikel_bookmarks" ADD CONSTRAINT "artikel_bookmarks_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
