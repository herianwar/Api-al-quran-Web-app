-- CreateTable
CREATE TABLE "seo_pages" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "label" TEXT,
    "title" TEXT,
    "description" TEXT,
    "keywords" TEXT,
    "ogImage" TEXT,
    "ogType" TEXT,
    "canonical" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "changefreq" TEXT,
    "priority" DOUBLE PRECISION,
    "jsonLd" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seo_pages_path_key" ON "seo_pages"("path");

-- CreateIndex
CREATE INDEX "seo_pages_isActive_idx" ON "seo_pages"("isActive");
