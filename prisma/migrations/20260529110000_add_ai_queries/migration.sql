





-- AlterTable

-- CreateTable
CREATE TABLE "ai_queries" (
    "id" BIGSERIAL NOT NULL,
    "query" TEXT NOT NULL,
    "userId" TEXT,
    "conversationId" TEXT,
    "resultCount" INTEGER NOT NULL,
    "topScore" DOUBLE PRECISION,
    "embedTokens" INTEGER NOT NULL DEFAULT 0,
    "llmTokensIn" INTEGER NOT NULL DEFAULT 0,
    "llmTokensOut" INTEGER NOT NULL DEFAULT 0,
    "embedModel" TEXT,
    "llmModel" TEXT,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "withSummary" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "clientHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_queries_createdAt_idx" ON "ai_queries"("createdAt");

-- CreateIndex
CREATE INDEX "ai_queries_query_idx" ON "ai_queries"("query");

-- CreateIndex
CREATE INDEX "ai_queries_topScore_idx" ON "ai_queries"("topScore");

-- CreateIndex
CREATE INDEX "ai_queries_conversationId_idx" ON "ai_queries"("conversationId");

