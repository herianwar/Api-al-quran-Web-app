-- CreateTable
CREATE TABLE "amalan_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tanggal" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amalan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khatam_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mulai" TEXT NOT NULL,
    "targetTanggal" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khatam_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amalan_logs_userId_tanggal_idx" ON "amalan_logs"("userId", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "amalan_logs_userId_tanggal_key_key" ON "amalan_logs"("userId", "tanggal", "key");

-- CreateIndex
CREATE UNIQUE INDEX "khatam_goals_userId_key" ON "khatam_goals"("userId");

-- AddForeignKey
ALTER TABLE "amalan_logs" ADD CONSTRAINT "amalan_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khatam_goals" ADD CONSTRAINT "khatam_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
