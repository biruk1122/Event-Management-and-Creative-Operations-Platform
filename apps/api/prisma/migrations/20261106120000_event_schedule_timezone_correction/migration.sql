-- Legacy event schedules. The event form took clock times in Africa/Addis_Ababa
-- but stored them as UTC, so every schedule written before this migration is
-- three hours late. Africa/Addis_Ababa is a fixed UTC+03:00 zone with no daylight
-- saving time, so the correction is a fixed three-hour subtraction.
--
-- Legacy rows are marked by schedule_tz_version = 1. Rows created afterwards
-- default to 2. The correction below touches version 1 rows only and marks each
-- one as version 2 in the same statement, so it cannot apply twice.
-- created_at, updated_at and audit records are not modified.

ALTER TABLE "events" ADD COLUMN "schedule_tz_version" SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE "events" ALTER COLUMN "schedule_tz_version" SET DEFAULT 2;
ALTER TABLE "events"
    ADD CONSTRAINT "events_schedule_tz_version_check" CHECK ("schedule_tz_version" IN (1, 2));

UPDATE "events"
SET "start_at" = "start_at" - INTERVAL '3 hours',
    "end_at" = "end_at" - INTERVAL '3 hours',
    "reminder_at" = "reminder_at" - INTERVAL '3 hours',
    "schedule_tz_version" = 2
WHERE "schedule_tz_version" = 1;
