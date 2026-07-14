-- Store user's phone number (E.164, e.g. +6281234567890). Nullable so existing
-- users are unaffected; unique so one number maps to at most one account.
-- Postgres treats NULLs as distinct, so multiple legacy NULL rows are allowed.
ALTER TABLE "users" ADD COLUMN "noHp" TEXT;

CREATE UNIQUE INDEX "users_noHp_key" ON "users"("noHp");
