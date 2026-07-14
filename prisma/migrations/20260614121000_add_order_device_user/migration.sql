-- Track which device / user placed an order, for "my orders" lookup.
ALTER TABLE "shop_orders" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "shop_orders" ADD COLUMN "userId" TEXT;

CREATE INDEX "shop_orders_deviceId_createdAt_idx" ON "shop_orders"("deviceId", "createdAt");
CREATE INDEX "shop_orders_userId_createdAt_idx" ON "shop_orders"("userId", "createdAt");

ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
