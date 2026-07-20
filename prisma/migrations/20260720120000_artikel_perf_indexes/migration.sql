-- Artikel: indexes for the public portal query paths.
--
-- Both indexes below were chosen from EXPLAIN (ANALYZE) on a 50k-row copy of
-- the table, not from theory. Two candidates were measured and rejected:
--
--   * @@index([status, publishedAt]) — never chosen by the planner. ~90% of
--     rows are 'published', so the status predicate is not selective and a
--     backward scan of artikel_publishedAt_idx already answers the
--     ORDER BY "publishedAt" DESC path optimally.
--   * DROP artikel_status_idx — the narrow status index is what the planner
--     picks for the count(*) half of the list query, and it beats every
--     composite there (~9ms vs ~14ms on 50k rows). It stays.

-- Featured carousel: WHERE status='published' AND "isFeatured".
-- Measured 24.7ms -> 0.11ms on 50k rows (the planner previously filtered all
-- 50k rows to find the ~2% featured ones).
CREATE INDEX IF NOT EXISTS "artikel_status_isFeatured_publishedAt_idx"
  ON "artikel" ("status", "isFeatured", "publishedAt");

-- Array containment on tags: the ?tag= filter and the "related articles"
-- hasSome lookup. A B-tree cannot answer these at all.
CREATE INDEX IF NOT EXISTS "artikel_tags_idx"
  ON "artikel" USING GIN ("tags");
