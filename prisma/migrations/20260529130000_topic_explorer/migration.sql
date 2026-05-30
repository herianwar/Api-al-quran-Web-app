





-- AlterTable

-- AlterTable
ALTER TABLE "topic_ayat" ADD COLUMN     "aiScore" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'curated';

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "aiSummaryAt" TIMESTAMP(3),
ADD COLUMN     "aiSummaryModel" TEXT,
ADD COLUMN     "readingPlan" JSONB,
ADD COLUMN     "readingPlanAt" TIMESTAMP(3),
ADD COLUMN     "readingPlanModel" TEXT;

-- CreateIndex
CREATE INDEX "topic_ayat_source_idx" ON "topic_ayat"("source");

