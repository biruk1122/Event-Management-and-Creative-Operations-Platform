-- Additive enum values for review history and subtask activity. Kept in their
-- own migration: Postgres cannot use a freshly added enum label in the same
-- transaction, and the next migration does not use these labels anyway.
ALTER TYPE "task_activity_type" ADD VALUE IF NOT EXISTS 'SUBMITTED_FOR_REVIEW';
ALTER TYPE "task_activity_type" ADD VALUE IF NOT EXISTS 'SUBTASK_ADDED';
ALTER TYPE "task_activity_type" ADD VALUE IF NOT EXISTS 'SUBTASK_UPDATED';
