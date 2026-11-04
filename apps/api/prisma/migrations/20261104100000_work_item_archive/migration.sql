-- Archive support for work items. A parent with talent assignment history is
-- archived (archived_at set) instead of deleted, so its assignments, activity
-- history and work_name snapshots remain intact. Adding nullable columns only:
-- no existing row is rewritten, and every existing row stays active (NULL).

ALTER TABLE "events" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
ALTER TABLE "productions" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
ALTER TABLE "campaigns" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
ALTER TABLE "campaign_activities" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
