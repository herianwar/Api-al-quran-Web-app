-- API usage analytics: raw per-request log (short retention) + permanent daily aggregate.

-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" BIGSERIAL NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "os" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_request_logs_createdAt_idx" ON "api_request_logs"("createdAt");
CREATE INDEX "api_request_logs_apiKeyId_idx" ON "api_request_logs"("apiKeyId");
CREATE INDEX "api_request_logs_endpoint_idx" ON "api_request_logs"("endpoint");

-- CreateTable
CREATE TABLE "api_usage_daily" (
    "id" BIGSERIAL NOT NULL,
    "date" DATE NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "sumLatencyMs" BIGINT NOT NULL DEFAULT 0,
    "maxLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_usage_daily_date_apiKeyId_platform_key" ON "api_usage_daily"("date", "apiKeyId", "platform");
CREATE INDEX "api_usage_daily_date_idx" ON "api_usage_daily"("date");
CREATE INDEX "api_usage_daily_apiKeyId_idx" ON "api_usage_daily"("apiKeyId");
