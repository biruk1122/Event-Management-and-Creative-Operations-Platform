-- AlterEnum
-- This migration adds a new NotificationType value. With PostgreSQL
-- versions 11 and earlier, a freshly added enum value cannot be used by DML
-- in the same transaction it was added in; keeping this in its own
-- migration (separate from any other DDL) avoids that entirely, matching
-- the precedent set by 20261016100000_report_notifications.
ALTER TYPE "notification_type" ADD VALUE 'PARTNER_FOLLOW_UP_DUE';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "partner_id" UUID;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints, so this one is widened here by
-- hand to add the new target column, matching the constraint as widened by
-- 20261016100000_report_notifications (task/message/event/meeting/expense/report)
-- plus partner_id.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_target_at_most_one";
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_target_at_most_one"
    CHECK (
        (CASE WHEN "task_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "message_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "event_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "meeting_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "expense_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "report_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "partner_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );

-- `PARTNER_FOLLOW_UP_DUE` is the eighth mutable notification type (ADR 0003
-- section 4): widen the application-mirrored CHECK on notification_preferences
-- the same way 20261016100000_report_notifications widened it for
-- REPORT_SUBMITTED/REVIEWED's siblings (those two are not mutable; this one is).
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_type_mutable";
ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_type_mutable"
    CHECK (
        "type" IN (
            'TASK_DUE', 'TASK_OVERDUE', 'NEW_MESSAGE', 'MEETING_REMINDER',
            'EVENT_REMINDER', 'TODO_REMINDER', 'REPORT_REMINDER', 'PARTNER_FOLLOW_UP_DUE'
        )
    );
