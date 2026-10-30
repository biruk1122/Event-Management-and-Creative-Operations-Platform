-- AlterTable
ALTER TABLE "events" ADD COLUMN "reminder_at" TIMESTAMPTZ(6);

-- A reminder is meaningless without a start time and can never be later
-- than it - mirrors "meetings_reminder_before_start" exactly, but also
-- requires start_at to be non-null (Event, unlike Meeting, may have no
-- start time yet while still in PLANNING).
ALTER TABLE "events"
    ADD CONSTRAINT "events_reminder_before_start"
    CHECK ("reminder_at" IS NULL OR ("start_at" IS NOT NULL AND "reminder_at" <= "start_at"));
