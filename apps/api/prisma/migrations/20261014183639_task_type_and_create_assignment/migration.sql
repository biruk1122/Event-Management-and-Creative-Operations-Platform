-- CreateEnum
CREATE TYPE "task_type" AS ENUM ('GENERAL', 'PLANNING', 'LOGISTICS', 'CREATIVE', 'TECHNICAL', 'ADMINISTRATIVE', 'REVIEW');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "type" "task_type" NOT NULL DEFAULT 'GENERAL';

-- Deliberately omitted: `prisma migrate dev` auto-generated a stray
-- `RenameIndex` here for `audit_records_resource_lookup_idx`, unrelated to
-- task type/assignment. It comes from a pre-existing drift between
-- schema.prisma's unnamed AuditRecord index and its originating migration's
-- custom index name (not introduced by this migration) - see the "Audit
-- records index name drift" note and the same omission in
-- `20261014072913_event_office_manager_department_links`. Leaving the
-- rename in broke task-schema.integration.spec.ts's exact-name assertion on
-- that index; removing it keeps this migration scoped to task type/
-- assignment and restores the pre-existing index name.
