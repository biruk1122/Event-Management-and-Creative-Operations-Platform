-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "task_activity_type" ADD VALUE 'CHECKLIST_ITEM_ADDED';
ALTER TYPE "task_activity_type" ADD VALUE 'CHECKLIST_ITEM_UPDATED';
ALTER TYPE "task_activity_type" ADD VALUE 'CHECKLIST_ITEM_COMPLETED';
ALTER TYPE "task_activity_type" ADD VALUE 'CHECKLIST_ITEM_REOPENED';
ALTER TYPE "task_activity_type" ADD VALUE 'CHECKLIST_ITEM_REMOVED';
ALTER TYPE "task_activity_type" ADD VALUE 'CHECKLIST_ITEM_REORDERED';

-- AlterTable
-- `progress` becomes nullable: NULL now means "not tracked" (no checklist
-- items and no subtasks), replacing the old always-0-on-creation default.
-- Existing rows keep their current integer value unchanged - this is purely
-- additive and never rewrites existing data.
ALTER TABLE "tasks" ALTER COLUMN "progress" DROP NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "progress" DROP DEFAULT;

-- The existing 0-100 CHECK must now also accept NULL explicitly; recreate it
-- rather than relying on SQL's implicit NULL-passes-CHECK behavior so the
-- intent is visible in the schema.
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_progress_in_range";
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_progress_in_range"
    CHECK ("progress" IS NULL OR "progress" BETWEEN 0 AND 100);

-- CreateTable
CREATE TABLE "task_checklist_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "completed_by_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_checklist_items_task_id_position_idx" ON "task_checklist_items"("task_id", "position");

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A checklist item's description, like every other user-entered task text
-- field in this schema, cannot be blank.
ALTER TABLE "task_checklist_items"
    ADD CONSTRAINT "task_checklist_items_description_not_blank"
    CHECK (btrim("description") <> '');

-- `completed = true` must always carry a completion timestamp, and vice
-- versa, so "who/when completed it" is never half-set.
ALTER TABLE "task_checklist_items"
    ADD CONSTRAINT "task_checklist_items_completed_consistency"
    CHECK (
        ("completed" = false AND "completed_at" IS NULL)
        OR ("completed" = true AND "completed_at" IS NOT NULL)
    );

-- Position must be non-negative; uniqueness per task is enforced in the
-- repository transaction (a reorder briefly needs duplicate positions to be
-- legal mid-shuffle), not as a DB constraint.
ALTER TABLE "task_checklist_items"
    ADD CONSTRAINT "task_checklist_items_position_non_negative"
    CHECK ("position" >= 0);
