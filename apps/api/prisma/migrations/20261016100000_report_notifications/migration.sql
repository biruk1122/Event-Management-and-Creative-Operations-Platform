-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'REPORT_SUBMITTED';
ALTER TYPE "notification_type" ADD VALUE 'REPORT_REVIEWED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "report_id" UUID;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints, so this one is widened here by
-- hand to add the new target column, matching the constraint as widened by
-- 20261014075251_expense_notifications (task/message/event/meeting/expense)
-- plus report_id.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_target_at_most_one";
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_target_at_most_one"
    CHECK (
        (CASE WHEN "task_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "message_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "event_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "meeting_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "expense_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "report_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );
