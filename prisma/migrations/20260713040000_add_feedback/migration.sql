-- Masukan & pengajuan fitur dari pengguna app (guest atau login).
-- Disubmit via POST /feedback, dikelola admin di /admin/feedback.
-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "appVersion" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'baru',
    "catatanAdmin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_status_idx" ON "feedback"("status");

-- CreateIndex
CREATE INDEX "feedback_kategori_idx" ON "feedback"("kategori");

-- CreateIndex
CREATE INDEX "feedback_createdAt_idx" ON "feedback"("createdAt");

-- CreateIndex
CREATE INDEX "feedback_userId_idx" ON "feedback"("userId");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
