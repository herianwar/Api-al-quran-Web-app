-- Wilayah Indonesia: provinces > regencies > districts > villages.
-- PK = official dotted region code (string).

CREATE TABLE "provinces" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "regencies" (
    "id" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    CONSTRAINT "regencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "regencyId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "villages" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    CONSTRAINT "villages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "regencies_provinceId_idx" ON "regencies"("provinceId");
CREATE INDEX "districts_regencyId_idx" ON "districts"("regencyId");
CREATE INDEX "villages_districtId_idx" ON "villages"("districtId");

ALTER TABLE "regencies" ADD CONSTRAINT "regencies_provinceId_fkey"
    FOREIGN KEY ("provinceId") REFERENCES "provinces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "districts" ADD CONSTRAINT "districts_regencyId_fkey"
    FOREIGN KEY ("regencyId") REFERENCES "regencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "villages" ADD CONSTRAINT "villages_districtId_fkey"
    FOREIGN KEY ("districtId") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
