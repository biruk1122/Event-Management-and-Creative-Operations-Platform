-- Preserve talent history. Deleting a talent must never silently remove its
-- assignments, assignment history or conflict overrides. Those links change from
-- ON DELETE CASCADE to ON DELETE RESTRICT, so a talent that has any of them can
-- only be archived (set INACTIVE), never physically deleted. Profile data that is
-- not history (schedules, social links) keeps its cascade and is unchanged.
--
-- Constraint changes only: no row is read back, rewritten or removed.

-- DropForeignKey / AddForeignKey: assignments
ALTER TABLE "event_talents" DROP CONSTRAINT "event_talents_talent_id_fkey";
ALTER TABLE "event_talents" ADD CONSTRAINT "event_talents_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_talents" DROP CONSTRAINT "production_talents_talent_id_fkey";
ALTER TABLE "production_talents" ADD CONSTRAINT "production_talents_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "promotion_activity_talents" DROP CONSTRAINT "promotion_activity_talents_talent_id_fkey";
ALTER TABLE "promotion_activity_talents" ADD CONSTRAINT "promotion_activity_talents_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey / AddForeignKey: history
ALTER TABLE "talent_activities" DROP CONSTRAINT "talent_activities_talent_id_fkey";
ALTER TABLE "talent_activities" ADD CONSTRAINT "talent_activities_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "talent_conflict_overrides" DROP CONSTRAINT "talent_conflict_overrides_talent_id_fkey";
ALTER TABLE "talent_conflict_overrides" ADD CONSTRAINT "talent_conflict_overrides_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- History rows cannot be deleted directly either (the talent foreign keys above
-- already stop cascades). The row trigger reuses the append-only function from
-- 20261103120000; TRUNCATE is unaffected, so test resets still work.
CREATE TRIGGER "talent_activities_no_delete" BEFORE DELETE ON "talent_activities"
    FOR EACH ROW EXECUTE FUNCTION "talent_history_append_only"();
CREATE TRIGGER "talent_conflict_overrides_no_delete" BEFORE DELETE ON "talent_conflict_overrides"
    FOR EACH ROW EXECUTE FUNCTION "talent_history_append_only"();
