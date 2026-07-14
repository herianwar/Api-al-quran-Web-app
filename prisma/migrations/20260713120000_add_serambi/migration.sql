-- Serambi: feed kutipan/renungan singkat dari tim admin Rumah Qur'an.
-- Post dibuat/dikelola admin (/admin/serambi). Publik bisa baca, like, komentar
-- lewat /serambi/posts. Counter like/komentar didenormalisasi & di-update
-- transaksional.

-- CreateTable
CREATE TABLE "serambi_posts" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "authorName" TEXT NOT NULL DEFAULT 'Rumah Qur''an',
    "authorAvatarUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'published',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serambi_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serambi_likes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "serambi_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serambi_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'visible',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "serambi_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "serambi_posts_status_createdAt_idx" ON "serambi_posts"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "serambi_likes_postId_userId_key" ON "serambi_likes"("postId", "userId");

-- CreateIndex
CREATE INDEX "serambi_likes_userId_idx" ON "serambi_likes"("userId");

-- CreateIndex
CREATE INDEX "serambi_comments_postId_createdAt_idx" ON "serambi_comments"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "serambi_comments_status_idx" ON "serambi_comments"("status");

-- CreateIndex
CREATE INDEX "serambi_comments_userId_idx" ON "serambi_comments"("userId");

-- AddForeignKey
ALTER TABLE "serambi_likes" ADD CONSTRAINT "serambi_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "serambi_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serambi_likes" ADD CONSTRAINT "serambi_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serambi_comments" ADD CONSTRAINT "serambi_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "serambi_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serambi_comments" ADD CONSTRAINT "serambi_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
