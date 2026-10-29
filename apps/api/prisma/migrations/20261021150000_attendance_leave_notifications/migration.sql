-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'ATTENDANCE_SHIFT_ASSIGNED';
ALTER TYPE "notification_type" ADD VALUE 'ATTENDANCE_SHIFT_SCHEDULE_CHANGED';
ALTER TYPE "notification_type" ADD VALUE 'ATTENDANCE_OVERTIME_DECIDED';
ALTER TYPE "notification_type" ADD VALUE 'ATTENDANCE_EXCEPTION_DECIDED';
ALTER TYPE "notification_type" ADD VALUE 'LEAVE_REQUEST_SUBMITTED';
ALTER TYPE "notification_type" ADD VALUE 'LEAVE_REQUEST_DECIDED';

-- These six types have no typed target column (list-only deep links, the
-- same precedent as TODO_REMINDER) - no notifications_target_at_most_one
-- widening needed.
--
-- They are also deliberately NOT added to notification_preferences_type_mutable:
-- each represents a direct action, decision outcome, or review-queue
-- obligation (an assignment, a schedule change affecting an assignment, a
-- decision on your own overtime/exception/leave, or a submission requiring
-- a manager's review) - the same category as task.assigned/task.reviewed/
-- report.submitted/report.reviewed/expense.submitted/expense.reviewed,
-- none of which are mutable either. The CHECK's existing list is left
-- untouched.
