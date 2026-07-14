-- CreateTable
CREATE TABLE "haid_periods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jenis" TEXT NOT NULL DEFAULT 'haid',
    "mulai" DATE NOT NULL,
    "selesai" DATE,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "haid_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qadha_puasa" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sumber" TEXT NOT NULL DEFAULT 'haid',
    "tahun" INTEGER,
    "jumlah" INTEGER NOT NULL,
    "lunas" INTEGER NOT NULL DEFAULT 0,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qadha_puasa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "haid_periods_userId_mulai_idx" ON "haid_periods"("userId", "mulai");

-- CreateIndex
CREATE INDEX "qadha_puasa_userId_idx" ON "qadha_puasa"("userId");

-- AddForeignKey
ALTER TABLE "haid_periods" ADD CONSTRAINT "haid_periods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qadha_puasa" ADD CONSTRAINT "qadha_puasa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
