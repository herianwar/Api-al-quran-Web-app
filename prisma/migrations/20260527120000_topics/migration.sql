-- Topics / tematik: browse ayat by theme (sabar, syukur, doa, dll)
CREATE TABLE "topics" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "deskripsi" TEXT,
    "urutan" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");
CREATE INDEX "topics_urutan_idx" ON "topics"("urutan");

CREATE TABLE "topic_ayat" (
    "id" SERIAL NOT NULL,
    "topicId" INTEGER NOT NULL,
    "ayatId" INTEGER NOT NULL,
    "catatan" TEXT,

    CONSTRAINT "topic_ayat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topic_ayat_topicId_ayatId_key" ON "topic_ayat"("topicId", "ayatId");
CREATE INDEX "topic_ayat_topicId_idx" ON "topic_ayat"("topicId");
CREATE INDEX "topic_ayat_ayatId_idx" ON "topic_ayat"("ayatId");

ALTER TABLE "topic_ayat" ADD CONSTRAINT "topic_ayat_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "topic_ayat" ADD CONSTRAINT "topic_ayat_ayatId_fkey"
    FOREIGN KEY ("ayatId") REFERENCES "ayat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
