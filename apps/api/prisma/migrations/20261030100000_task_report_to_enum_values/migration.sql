-- AlterEnum
-- Enum values only: PostgreSQL cannot use a freshly added enum label in the
-- same transaction that adds it, so the columns and constraints that rely on
-- these live in the next migration (the repo's usual two-file split).

ALTER TYPE "notification_type" ADD VALUE 'TASK_SUBMITTED';
ALTER TYPE "notification_type" ADD VALUE 'TASK_REPORT_TO_ASSIGNED';
ALTER TYPE "notification_type" ADD VALUE 'TASK_BLOCKED';

ALTER TYPE "task_activity_type" ADD VALUE 'REPORT_TO_CHANGED';

-- These notification types have no typed target column beyond the existing
-- task_id, so notifications_target_at_most_one is untouched. They are
-- deliberately NOT added to notification_preferences_type_mutable: each is a
-- direct action or review-queue obligation (a submission awaiting the
-- recipient's review, being named the recipient, an escalated block), the
-- same category as TASK_ASSIGNED / REPORT_SUBMITTED, none of which are mutable.
