-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'LETTER_SHARED';
ALTER TYPE "notification_type" ADD VALUE 'DOCUMENT_SHARED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "document_id" UUID,
ADD COLUMN     "letter_id" UUID;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints, so this one is widened here by
-- hand to add the two new target columns, matching the constraint as
-- widened by 20261019150000_partner_follow_up_notifications
-- (task/message/event/meeting/expense/report/partner) plus letter_id/document_id.
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
        (CASE WHEN "partner_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "letter_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "document_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );

-- `LETTER_SHARED`/`DOCUMENT_SHARED` are the ninth and tenth mutable
-- notification types (ADR 0003 section 4): widen the application-mirrored
-- CHECK on notification_preferences the same way
-- 20261019150000_partner_follow_up_notifications widened it for
-- PARTNER_FOLLOW_UP_DUE.
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_type_mutable";
ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_type_mutable"
    CHECK (
        "type" IN (
            'TASK_DUE', 'TASK_OVERDUE', 'NEW_MESSAGE', 'MEETING_REMINDER',
            'EVENT_REMINDER', 'TODO_REMINDER', 'REPORT_REMINDER', 'PARTNER_FOLLOW_UP_DUE',
            'LETTER_SHARED', 'DOCUMENT_SHARED'
        )
    );

