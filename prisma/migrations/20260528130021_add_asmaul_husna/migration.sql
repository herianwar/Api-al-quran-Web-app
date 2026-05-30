-- CreateTable
CREATE TABLE "asmaul_husna" (
    "id" INTEGER NOT NULL,
    "arab" TEXT NOT NULL,
    "latin" TEXT NOT NULL,
    "arti" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asmaul_husna_pkey" PRIMARY KEY ("id")
);
