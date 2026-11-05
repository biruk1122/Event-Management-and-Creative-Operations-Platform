-- A promotion detail with talent history cannot be deleted: its assignments
-- restrict the row. Archive the detail itself, so that removing it leaves the
-- shared campaign activity in place. Nullable column only: no row is rewritten.

ALTER TABLE "promotion_activities" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
