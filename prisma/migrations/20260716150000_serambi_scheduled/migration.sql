-- Postingan terjadwal Serambi: status "scheduled" + waktu tayang.
-- Dipromosikan ke "published" oleh sweep saat waktunya tiba (mirip artikel).

ALTER TABLE "serambi_posts" ADD COLUMN "scheduledAt" TIMESTAMP(3);
CREATE INDEX "serambi_posts_status_scheduledAt_idx" ON "serambi_posts"("status", "scheduledAt");
