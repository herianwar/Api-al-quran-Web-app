-- Add rating, ratingCount, and soldCount to shop_products.
ALTER TABLE "shop_products" ADD COLUMN "rating" DOUBLE PRECISION;
ALTER TABLE "shop_products" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shop_products" ADD COLUMN "soldCount" INTEGER NOT NULL DEFAULT 0;
