-- CreateTable
CREATE TABLE "artikel_kategori" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "deskripsi" TEXT,
    "urutan" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artikel_kategori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artikel" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "ringkasan" TEXT,
    "konten" TEXT NOT NULL,
    "coverUrl" TEXT,
    "coverAlt" TEXT,
    "penulis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "menitBaca" INTEGER NOT NULL DEFAULT 1,
    "views" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "categoryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artikel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artikel_kategori_slug_key" ON "artikel_kategori"("slug");

-- CreateIndex
CREATE INDEX "artikel_kategori_urutan_idx" ON "artikel_kategori"("urutan");

-- CreateIndex
CREATE UNIQUE INDEX "artikel_slug_key" ON "artikel"("slug");

-- CreateIndex
CREATE INDEX "artikel_status_idx" ON "artikel"("status");

-- CreateIndex
CREATE INDEX "artikel_categoryId_idx" ON "artikel"("categoryId");

-- CreateIndex
CREATE INDEX "artikel_isFeatured_idx" ON "artikel"("isFeatured");

-- CreateIndex
CREATE INDEX "artikel_publishedAt_idx" ON "artikel"("publishedAt");

-- AddForeignKey
ALTER TABLE "artikel" ADD CONSTRAINT "artikel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "artikel_kategori"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: starter categories + welcome article so the portal is non-empty.
INSERT INTO "artikel_kategori" ("slug", "nama", "deskripsi", "urutan", "isActive", "updatedAt") VALUES
    ('kajian', 'Kajian', 'Kajian tematik seputar Al-Qur''an, tafsir, dan ilmu agama.', 10, true, CURRENT_TIMESTAMP),
    ('kisah-inspiratif', 'Kisah Inspiratif', 'Kisah para nabi, sahabat, dan teladan untuk menguatkan iman.', 20, true, CURRENT_TIMESTAMP),
    ('panduan-ibadah', 'Panduan Ibadah', 'Tuntunan praktis ibadah harian: shalat, doa, dzikir, dan amalan.', 30, true, CURRENT_TIMESTAMP),
    ('berita', 'Berita & Info', 'Kabar terbaru, pengumuman, dan informasi seputar Rumah Qur''an.', 40, true, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "artikel" ("slug", "judul", "ringkasan", "konten", "penulis", "status", "isFeatured", "tags", "menitBaca", "publishedAt", "categoryId", "updatedAt")
SELECT
    'selamat-datang-di-portal-artikel',
    'Selamat Datang di Portal Artikel Rumah Qur''an',
    'Portal artikel Rumah Qur''an hadir sebagai ruang berbagi ilmu: kajian, kisah inspiratif, dan panduan ibadah harian yang ringan dibaca.',
    '<h2>Bismillah</h2><p>Selamat datang di <strong>Portal Artikel Rumah Qur''an</strong>. Di sini kami berbagi tulisan seputar Al-Qur''an, tafsir, kisah inspiratif, serta panduan ibadah harian agar lebih mudah dipahami dan diamalkan.</p><h3>Apa yang bisa Anda temukan?</h3><ul><li>Kajian tematik yang ringkas dan berdalil.</li><li>Kisah para nabi dan teladan umat terdahulu.</li><li>Panduan praktis ibadah sehari-hari.</li></ul><blockquote>"Sebaik-baik kalian adalah yang mempelajari Al-Qur''an dan mengajarkannya." (HR. Bukhari)</blockquote><p>Semoga setiap tulisan di sini menjadi ilmu yang bermanfaat dan amal jariyah bagi kita semua. Selamat membaca!</p>',
    'Tim Rumah Qur''an',
    'published',
    true,
    ARRAY['pengumuman','sambutan']::TEXT[],
    2,
    CURRENT_TIMESTAMP,
    (SELECT "id" FROM "artikel_kategori" WHERE "slug" = 'berita' LIMIT 1),
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "artikel" WHERE "slug" = 'selamat-datang-di-portal-artikel');
