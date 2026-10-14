-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'EXPENSE_SUBMITTED';
ALTER TYPE "notification_type" ADD VALUE 'EXPENSE_REVIEWED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "expense_id" UUID;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints, so this one is widened here by
-- hand to add the new target column, matching the constraint as widened by
-- 20260917110000_add_meetings (task/message/event/meeting) plus expense_id.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_target_at_most_one";
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_target_at_most_one"
    CHECK (
        (CASE WHEN "task_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "message_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "event_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "meeting_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "expense_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );
