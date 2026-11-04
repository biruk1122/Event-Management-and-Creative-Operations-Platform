-- Talent assignment lifecycle (TAL Stage 1).
--
-- Additive, data-preserving changes:
--   * event_talents, production_talents, promotion_activity_talents gain
--     scheduling, notes, actor, completion and cancellation columns. Existing
--     rows keep their values and become ASSIGNED where the table had no status.
--   * `active_slot` is 1 only while an assignment is ASSIGNED. The unique key
--     becomes (work, talent, active_slot), so a talent has at most one active
--     assignment per work item while every cancelled or completed row is kept.
--   * A trigger maintains `active_slot` from `status`, rejects any change to a
--     terminal (COMPLETED or CANCELLED) row, and so makes reactivation and
--     overwriting history impossible in the database itself.
--   * talent_activities (append-only history) and talent_conflict_overrides
--     (one row per authorized override) are new tables.
--
-- No row is deleted, merged or rewritten beyond setting the new columns. The
-- pre-flight block below stops the migration with a listed, actionable error if
-- any work item already has more than one ASSIGNED row, before the unique key
-- changes. Prisma applies each migration in a transaction, so a stop rolls back
-- everything in this file.

-- CreateEnum
CREATE TYPE "talent_assignment_kind" AS ENUM ('EVENT', 'PRODUCTION', 'PROMOTION');

-- CreateEnum
CREATE TYPE "talent_activity_type" AS ENUM (
    'CREATED',
    'UPDATED',
    'AVAILABILITY_CHANGED',
    'MANAGER_CHANGED',
    'PROFILE_IMAGE_CHANGED',
    'ASSIGNMENT_CREATED',
    'ASSIGNMENT_UPDATED',
    'ASSIGNMENT_COMPLETED',
    'ASSIGNMENT_CANCELLED',
    'CONFLICT_OVERRIDDEN'
);

-- AlterTable: event assignments
ALTER TABLE "event_talents"
    ADD COLUMN "start_at" TIMESTAMPTZ(6),
    ADD COLUMN "end_at" TIMESTAMPTZ(6),
    ADD COLUMN "notes" TEXT,
    ADD COLUMN "assigned_by_id" UUID,
    ADD COLUMN "completed_at" TIMESTAMPTZ(6),
    ADD COLUMN "completed_by_id" UUID,
    ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
    ADD COLUMN "cancelled_by_id" UUID,
    ADD COLUMN "cancel_reason" TEXT,
    ADD COLUMN "active_slot" SMALLINT;

-- AlterTable: production assignments (gain status instead of hard deletion)
ALTER TABLE "production_talents"
    ADD COLUMN "status" "talent_assignment_status" NOT NULL DEFAULT 'ASSIGNED',
    ADD COLUMN "start_at" TIMESTAMPTZ(6),
    ADD COLUMN "end_at" TIMESTAMPTZ(6),
    ADD COLUMN "notes" TEXT,
    ADD COLUMN "assigned_by_id" UUID,
    ADD COLUMN "completed_at" TIMESTAMPTZ(6),
    ADD COLUMN "completed_by_id" UUID,
    ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
    ADD COLUMN "cancelled_by_id" UUID,
    ADD COLUMN "cancel_reason" TEXT,
    ADD COLUMN "active_slot" SMALLINT;

-- AlterTable: promotional activity assignments
ALTER TABLE "promotion_activity_talents"
    ADD COLUMN "status" "talent_assignment_status" NOT NULL DEFAULT 'ASSIGNED',
    ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "start_at" TIMESTAMPTZ(6),
    ADD COLUMN "end_at" TIMESTAMPTZ(6),
    ADD COLUMN "notes" TEXT,
    ADD COLUMN "assigned_by_id" UUID,
    ADD COLUMN "completed_at" TIMESTAMPTZ(6),
    ADD COLUMN "completed_by_id" UUID,
    ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
    ADD COLUMN "cancelled_by_id" UUID,
    ADD COLUMN "cancel_reason" TEXT,
    ADD COLUMN "active_slot" SMALLINT;

-- Backfill active_slot for rows that are ASSIGNED today. Runs before the trigger
-- exists, so it only sets the new column.
UPDATE "event_talents" SET "active_slot" = 1 WHERE "status" = 'ASSIGNED';
UPDATE "production_talents" SET "active_slot" = 1 WHERE "status" = 'ASSIGNED';
UPDATE "promotion_activity_talents" SET "active_slot" = 1 WHERE "status" = 'ASSIGNED';

-- Pre-flight: stop with an actionable message, changing nothing, if any work item
-- already has more than one ASSIGNED row. The existing unique keys make this
-- impossible today; the check protects databases where that may not hold.
DO $$
DECLARE
    duplicates TEXT;
BEGIN
    SELECT string_agg(format('event %s / talent %s (%s active rows)', event_id, talent_id, n), '; ')
      INTO duplicates
      FROM (
          SELECT event_id, talent_id, count(*) AS n
            FROM "event_talents"
           WHERE "active_slot" = 1
           GROUP BY event_id, talent_id
          HAVING count(*) > 1
      ) d;
    IF duplicates IS NOT NULL THEN
        RAISE EXCEPTION 'Talent assignment migration stopped before changing data: duplicate active event assignments exist (%). Cancel the extra rows through the application (or resolve them manually, keeping the record you want active), then run the migration again. No rows were changed.', duplicates
            USING ERRCODE = 'unique_violation';
    END IF;

    SELECT string_agg(format('production %s / talent %s (%s active rows)', production_id, talent_id, n), '; ')
      INTO duplicates
      FROM (
          SELECT production_id, talent_id, count(*) AS n
            FROM "production_talents"
           WHERE "active_slot" = 1
           GROUP BY production_id, talent_id
          HAVING count(*) > 1
      ) d;
    IF duplicates IS NOT NULL THEN
        RAISE EXCEPTION 'Talent assignment migration stopped before changing data: duplicate active production assignments exist (%). Cancel the extra rows through the application (or resolve them manually, keeping the record you want active), then run the migration again. No rows were changed.', duplicates
            USING ERRCODE = 'unique_violation';
    END IF;

    SELECT string_agg(format('promotion activity %s / talent %s (%s active rows)', campaign_activity_id, talent_id, n), '; ')
      INTO duplicates
      FROM (
          SELECT campaign_activity_id, talent_id, count(*) AS n
            FROM "promotion_activity_talents"
           WHERE "active_slot" = 1
           GROUP BY campaign_activity_id, talent_id
          HAVING count(*) > 1
      ) d;
    IF duplicates IS NOT NULL THEN
        RAISE EXCEPTION 'Talent assignment migration stopped before changing data: duplicate active promotion assignments exist (%). Cancel the extra rows through the application (or resolve them manually, keeping the record you want active), then run the migration again. No rows were changed.', duplicates
            USING ERRCODE = 'unique_violation';
    END IF;
END $$;

-- Replace the one-row-per-pair keys with one-active-row-per-pair keys.
DROP INDEX "event_talents_event_id_talent_id_key";
CREATE UNIQUE INDEX "event_talents_event_id_talent_id_active_slot_key" ON "event_talents"("event_id", "talent_id", "active_slot");

ALTER TABLE "production_talents" DROP CONSTRAINT "production_talents_production_id_talent_id_key";
CREATE UNIQUE INDEX "production_talents_production_id_talent_id_active_slot_key" ON "production_talents"("production_id", "talent_id", "active_slot");

DROP INDEX "promotion_activity_talents_campaign_activity_id_talent_id_key";
CREATE UNIQUE INDEX "promotion_activity_talents_campaign_activity_id_talent_id_active_slot_key" ON "promotion_activity_talents"("campaign_activity_id", "talent_id", "active_slot");

-- Indexes for status-filtered reads
CREATE INDEX "production_talents_production_id_status_idx" ON "production_talents"("production_id", "status");
CREATE INDEX "promotion_activity_talents_campaign_activity_id_status_idx" ON "promotion_activity_talents"("campaign_activity_id", "status");

-- Foreign keys for the new actor columns (ON DELETE SET NULL keeps history when a user is removed)
ALTER TABLE "event_talents" ADD CONSTRAINT "event_talents_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_talents" ADD CONSTRAINT "event_talents_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_talents" ADD CONSTRAINT "event_talents_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_talents" ADD CONSTRAINT "production_talents_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_talents" ADD CONSTRAINT "production_talents_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_talents" ADD CONSTRAINT "production_talents_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "promotion_activity_talents" ADD CONSTRAINT "promotion_activity_talents_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "promotion_activity_talents" ADD CONSTRAINT "promotion_activity_talents_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "promotion_activity_talents" ADD CONSTRAINT "promotion_activity_talents_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Consistency rules the application relies on, enforced by the database too
-- The terminal-state checks are NOT VALID: they apply to every new or changed row,
-- but do not re-check rows that already exist. Assignments written by the earlier
-- transition endpoint are CANCELLED or COMPLETED without a timestamp; the trigger
-- below freezes those rows, so they stay as recorded instead of being rewritten.
ALTER TABLE "event_talents"
    ADD CONSTRAINT "event_talents_active_slot_matches_status" CHECK (("status" = 'ASSIGNED') = ("active_slot" IS NOT NULL)),
    ADD CONSTRAINT "event_talents_schedule_order" CHECK ("end_at" IS NULL OR "start_at" IS NULL OR "end_at" >= "start_at"),
    ADD CONSTRAINT "event_talents_completed_matches_status" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL)) NOT VALID,
    ADD CONSTRAINT "event_talents_cancelled_matches_status" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)) NOT VALID;
ALTER TABLE "production_talents"
    ADD CONSTRAINT "production_talents_active_slot_matches_status" CHECK (("status" = 'ASSIGNED') = ("active_slot" IS NOT NULL)),
    ADD CONSTRAINT "production_talents_schedule_order" CHECK ("end_at" IS NULL OR "start_at" IS NULL OR "end_at" >= "start_at"),
    ADD CONSTRAINT "production_talents_completed_matches_status" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL)) NOT VALID,
    ADD CONSTRAINT "production_talents_cancelled_matches_status" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)) NOT VALID;
ALTER TABLE "promotion_activity_talents"
    ADD CONSTRAINT "promotion_activity_talents_active_slot_matches_status" CHECK (("status" = 'ASSIGNED') = ("active_slot" IS NOT NULL)),
    ADD CONSTRAINT "promotion_activity_talents_schedule_order" CHECK ("end_at" IS NULL OR "start_at" IS NULL OR "end_at" >= "start_at"),
    ADD CONSTRAINT "promotion_activity_talents_completed_matches_status" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL)) NOT VALID,
    ADD CONSTRAINT "promotion_activity_talents_cancelled_matches_status" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)) NOT VALID;

-- Lifecycle trigger: maintains active_slot from status and freezes terminal rows.
CREATE FUNCTION "talent_assignment_lifecycle"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD."status" <> 'ASSIGNED' THEN
        RAISE EXCEPTION 'talent assignment % is % and cannot change: completed and cancelled assignments are history', OLD."id", OLD."status"
            USING ERRCODE = 'check_violation';
    END IF;
    NEW."active_slot" := CASE WHEN NEW."status" = 'ASSIGNED' THEN 1 ELSE NULL END;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "event_talents_lifecycle" BEFORE INSERT OR UPDATE ON "event_talents"
    FOR EACH ROW EXECUTE FUNCTION "talent_assignment_lifecycle"();
CREATE TRIGGER "production_talents_lifecycle" BEFORE INSERT OR UPDATE ON "production_talents"
    FOR EACH ROW EXECUTE FUNCTION "talent_assignment_lifecycle"();
CREATE TRIGGER "promotion_activity_talents_lifecycle" BEFORE INSERT OR UPDATE ON "promotion_activity_talents"
    FOR EACH ROW EXECUTE FUNCTION "talent_assignment_lifecycle"();

-- CreateTable: append-only talent history
CREATE TABLE "talent_activities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "talent_id" UUID NOT NULL,
    "type" "talent_activity_type" NOT NULL,
    "assignment_kind" "talent_assignment_kind",
    "assignment_id" UUID,
    "actor_id" UUID,
    "details" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable: authorized conflict overrides
CREATE TABLE "talent_conflict_overrides" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "talent_id" UUID NOT NULL,
    "assignment_kind" "talent_assignment_kind" NOT NULL,
    "assignment_id" UUID NOT NULL,
    "authorized_by_id" UUID,
    "authorized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "conflicts" JSONB NOT NULL,

    CONSTRAINT "talent_conflict_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "talent_activities_talent_id_occurred_at_idx" ON "talent_activities"("talent_id", "occurred_at");
CREATE INDEX "talent_activities_assignment_kind_assignment_id_idx" ON "talent_activities"("assignment_kind", "assignment_id");
CREATE INDEX "talent_conflict_overrides_talent_id_authorized_at_idx" ON "talent_conflict_overrides"("talent_id", "authorized_at");
CREATE INDEX "talent_conflict_overrides_assignment_kind_assignment_id_idx" ON "talent_conflict_overrides"("assignment_kind", "assignment_id");

ALTER TABLE "talent_activities" ADD CONSTRAINT "talent_activities_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "talent_activities" ADD CONSTRAINT "talent_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "talent_conflict_overrides" ADD CONSTRAINT "talent_conflict_overrides_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "talent_conflict_overrides" ADD CONSTRAINT "talent_conflict_overrides_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only history: a row is never updated. Deletion happens only through the
-- talent foreign key cascade, which talent removal already relies on.
CREATE FUNCTION "talent_history_append_only"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'talent history rows are append-only (% on %)', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "talent_activities_append_only" BEFORE UPDATE ON "talent_activities"
    FOR EACH ROW EXECUTE FUNCTION "talent_history_append_only"();
CREATE TRIGGER "talent_conflict_overrides_append_only" BEFORE UPDATE ON "talent_conflict_overrides"
    FOR EACH ROW EXECUTE FUNCTION "talent_history_append_only"();
