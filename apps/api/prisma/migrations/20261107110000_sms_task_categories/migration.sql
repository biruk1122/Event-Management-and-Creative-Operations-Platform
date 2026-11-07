-- Phase 2: task SMS categories and the due date a reminder was scheduled for.
-- Additive only.

ALTER TYPE "sms_category" ADD VALUE 'TASK_ASSIGNED';
ALTER TYPE "sms_category" ADD VALUE 'TASK_REMINDER';
ALTER TYPE "sms_category" ADD VALUE 'TASK_OVERDUE';

ALTER TABLE "sms_messages" ADD COLUMN "source_due_at" TIMESTAMPTZ(6);
