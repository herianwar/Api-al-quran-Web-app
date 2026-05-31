-- Track the authenticated end-user on API request logs (for "active users").
ALTER TABLE "api_request_logs" ADD COLUMN "userId" TEXT;
CREATE INDEX "api_request_logs_userId_idx" ON "api_request_logs"("userId");
