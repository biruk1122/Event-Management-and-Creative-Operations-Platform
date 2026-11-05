-- Assignment history is never removed with its work item. The work-item
-- references change from ON DELETE CASCADE to ON DELETE RESTRICT, so an event,
-- production, or promotional activity with talent assignment history cannot be
-- deleted; its owner must cancel the assignments or archive the work item instead.
--
-- Each assignment also records the work item's name at the time it was made
-- (work_name). The snapshot is filled on insert by a trigger, so it is present
-- for every new row, and existing rows are backfilled from the current name.
-- The column stays nullable: the work item reference is required, so a row
-- without a snapshot can only come from a bypass, and the trigger covers inserts.
-- No row is removed or rewritten beyond that backfill.

-- Restrict the work-item references
ALTER TABLE "event_talents" DROP CONSTRAINT "event_talents_event_id_fkey";
ALTER TABLE "event_talents" ADD CONSTRAINT "event_talents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_talents" DROP CONSTRAINT "production_talents_production_id_fkey";
ALTER TABLE "production_talents" ADD CONSTRAINT "production_talents_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "promotion_activity_talents" DROP CONSTRAINT "promotion_activity_talents_campaign_activity_id_fkey";
ALTER TABLE "promotion_activity_talents" ADD CONSTRAINT "promotion_activity_talents_campaign_activity_id_fkey" FOREIGN KEY ("campaign_activity_id") REFERENCES "promotion_activities"("campaign_activity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Work-item name snapshot
ALTER TABLE "event_talents" ADD COLUMN "work_name" TEXT;
UPDATE "event_talents" AS et SET "work_name" = e."name" FROM "events" AS e WHERE e."id" = et."event_id";

ALTER TABLE "production_talents" ADD COLUMN "work_name" TEXT;
UPDATE "production_talents" AS pt SET "work_name" = p."name" FROM "productions" AS p WHERE p."id" = pt."production_id";

ALTER TABLE "promotion_activity_talents" ADD COLUMN "work_name" TEXT;
UPDATE "promotion_activity_talents" AS pat SET "work_name" = ca."name" FROM "campaign_activities" AS ca WHERE ca."id" = pat."campaign_activity_id";

CREATE FUNCTION "talent_event_assignment_work_snapshot"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."work_name" IS NULL THEN
        SELECT e."name" INTO NEW."work_name" FROM "events" AS e WHERE e."id" = NEW."event_id";
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION "talent_production_assignment_work_snapshot"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."work_name" IS NULL THEN
        SELECT p."name" INTO NEW."work_name" FROM "productions" AS p WHERE p."id" = NEW."production_id";
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION "talent_promotion_assignment_work_snapshot"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."work_name" IS NULL THEN
        SELECT ca."name" INTO NEW."work_name" FROM "campaign_activities" AS ca WHERE ca."id" = NEW."campaign_activity_id";
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "event_talents_work_snapshot" BEFORE INSERT ON "event_talents"
    FOR EACH ROW EXECUTE FUNCTION "talent_event_assignment_work_snapshot"();
CREATE TRIGGER "production_talents_work_snapshot" BEFORE INSERT ON "production_talents"
    FOR EACH ROW EXECUTE FUNCTION "talent_production_assignment_work_snapshot"();
CREATE TRIGGER "promotion_activity_talents_work_snapshot" BEFORE INSERT ON "promotion_activity_talents"
    FOR EACH ROW EXECUTE FUNCTION "talent_promotion_assignment_work_snapshot"();
