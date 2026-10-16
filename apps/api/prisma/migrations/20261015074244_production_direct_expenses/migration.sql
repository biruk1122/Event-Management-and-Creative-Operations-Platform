-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "production_id" UUID,
ALTER COLUMN "event_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "expenses_production_id_status_idx" ON "expenses"("production_id", "status");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An expense must be anchored to at least one of an event or a production -
-- mirrors "tasks_has_owner"'s workspace/department shape.
ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_has_owner"
    CHECK ("event_id" IS NOT NULL OR "production_id" IS NOT NULL);
