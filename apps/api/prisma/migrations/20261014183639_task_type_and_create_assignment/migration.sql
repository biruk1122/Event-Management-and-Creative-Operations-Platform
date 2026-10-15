-- CreateEnum
CREATE TYPE "task_type" AS ENUM ('GENERAL', 'PLANNING', 'LOGISTICS', 'CREATIVE', 'TECHNICAL', 'ADMINISTRATIVE', 'REVIEW');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "type" "task_type" NOT NULL DEFAULT 'GENERAL';

-- RenameIndex
ALTER INDEX "audit_records_resource_lookup_idx" RENAME TO "audit_records_resource_type_resource_id_occurred_at_idx";
