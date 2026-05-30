-- CreateTable
CREATE TABLE "shop_banners" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_banners_isActive_sortOrder_idx" ON "shop_banners"("isActive", "sortOrder");
