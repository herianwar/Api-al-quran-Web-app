-- CreateTable
CREATE TABLE "perawi" (
    "slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perawi_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "hadis" (
    "id" SERIAL NOT NULL,
    "perawiSlug" TEXT NOT NULL,
    "nomor" INTEGER NOT NULL,
    "arab" TEXT NOT NULL,
    "terjemahan" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hadis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hadis_perawiSlug_idx" ON "hadis"("perawiSlug");

-- CreateIndex
CREATE UNIQUE INDEX "hadis_perawiSlug_nomor_key" ON "hadis"("perawiSlug", "nomor");

-- AddForeignKey
ALTER TABLE "hadis" ADD CONSTRAINT "hadis_perawiSlug_fkey" FOREIGN KEY ("perawiSlug") REFERENCES "perawi"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
