-- AlterTable: SEO overrides + scheduled-publish support for articles
ALTER TABLE "artikel" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "artikel" ADD COLUMN "metaTitle" TEXT;
ALTER TABLE "artikel" ADD COLUMN "metaDescription" TEXT;
ALTER TABLE "artikel" ADD COLUMN "ogImage" TEXT;

-- CreateIndex
CREATE INDEX "artikel_scheduledAt_idx" ON "artikel"("scheduledAt");
