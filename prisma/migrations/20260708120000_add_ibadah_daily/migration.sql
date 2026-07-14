-- CreateTable
CREATE TABLE "user_ibadah_daily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tanggal" TEXT NOT NULL,
    "subuh" BOOLEAN NOT NULL DEFAULT false,
    "dzuhur" BOOLEAN NOT NULL DEFAULT false,
    "ashar" BOOLEAN NOT NULL DEFAULT false,
    "maghrib" BOOLEAN NOT NULL DEFAULT false,
    "isya" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ibadah_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_ibadah_daily_userId_tanggal_idx" ON "user_ibadah_daily"("userId", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "user_ibadah_daily_userId_tanggal_key" ON "user_ibadah_daily"("userId", "tanggal");

-- AddForeignKey
ALTER TABLE "user_ibadah_daily" ADD CONSTRAINT "user_ibadah_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
