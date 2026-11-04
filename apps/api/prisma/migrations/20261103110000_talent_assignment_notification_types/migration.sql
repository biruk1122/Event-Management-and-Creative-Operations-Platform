-- Talent assignment notifications. Enum value additions get their own migration
-- file, matching the repository's existing `ALTER TYPE ... ADD VALUE` precedent,
-- so the new values are committed before the lifecycle migration uses them.

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TALENT_ASSIGNED';

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TALENT_ASSIGNMENT_CANCELLED';
