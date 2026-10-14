-- CreateEnum
CREATE TYPE "expense_category" AS ENUM ('VENUE', 'CATERING', 'TALENT_FEES', 'MARKETING_MATERIALS', 'LOGISTICS', 'EQUIPMENT', 'STAFFING', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "expense_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "expense_review_outcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "supplier_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
ALTER TYPE "report_status" ADD VALUE 'UNDER_REVIEW';

-- AlterEnum
ALTER TYPE "report_type" ADD VALUE 'POST_EVENT';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "department_id" UUID;

-- AlterTable
ALTER TABLE "managed_files" ADD COLUMN     "intent_expense_id" UUID;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "minutes" TEXT;

-- AlterTable
ALTER TABLE "productions" ADD COLUMN     "event_id" UUID;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "lessons_learned" TEXT,
ADD COLUMN     "recommendations" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "source_meeting_id" UUID;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "category" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "department_id" UUID,
    "status" "supplier_status" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "supplier_id" UUID,
    "category" "expense_category" NOT NULL,
    "description" TEXT NOT NULL,
    "planned_amount" DECIMAL(14,2),
    "actual_amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "expense_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_reviews" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "expense_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "outcome" "expense_review_outcome" NOT NULL,
    "note" TEXT,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_attachments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "expense_id" UUID NOT NULL,
    "managed_file_id" UUID NOT NULL,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_department_id_status_idx" ON "suppliers"("department_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_department_id_key" ON "suppliers"("name", "department_id");

-- CreateIndex
CREATE INDEX "expenses_event_id_status_idx" ON "expenses"("event_id", "status");

-- CreateIndex
CREATE INDEX "expenses_department_id_status_idx" ON "expenses"("department_id", "status");

-- CreateIndex
CREATE INDEX "expenses_supplier_id_idx" ON "expenses"("supplier_id");

-- CreateIndex
CREATE INDEX "expenses_created_by_id_idx" ON "expenses"("created_by_id");

-- CreateIndex
CREATE INDEX "expense_reviews_expense_id_reviewed_at_idx" ON "expense_reviews"("expense_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "expense_reviews_reviewer_id_reviewed_at_idx" ON "expense_reviews"("reviewer_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "expense_attachments_managed_file_id_idx" ON "expense_attachments"("managed_file_id");

-- CreateIndex
CREATE INDEX "expense_attachments_attached_by_id_idx" ON "expense_attachments"("attached_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_attachments_expense_id_managed_file_id_key" ON "expense_attachments"("expense_id", "managed_file_id");

-- CreateIndex
CREATE INDEX "events_department_id_status_idx" ON "events"("department_id", "status");

-- CreateIndex
CREATE INDEX "managed_files_intent_expense_id_idx" ON "managed_files"("intent_expense_id");

-- CreateIndex
CREATE INDEX "productions_event_id_idx" ON "productions"("event_id");

-- CreateIndex
CREATE INDEX "tasks_source_meeting_id_idx" ON "tasks"("source_meeting_id");

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_expense_id_fkey" FOREIGN KEY ("intent_expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_meeting_id_fkey" FOREIGN KEY ("source_meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_reviews" ADD CONSTRAINT "expense_reviews_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_reviews" ADD CONSTRAINT "expense_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deliberately omitted: `prisma migrate dev` auto-generated a stray
-- `RenameIndex` here for `audit_records_resource_lookup_idx`, unrelated to
-- EOM-01. It comes from a pre-existing drift between schema.prisma's
-- unnamed AuditRecord index and its originating migration's custom index
-- name (not introduced by this migration) - see the "Audit records index
-- name drift" note. Leaving the rename in broke
-- task-schema.integration.spec.ts's exact-name assertion on that index, a
-- real regression attributable to this migration even though the
-- underlying name drift is not; removing it keeps this migration scoped to
-- EOM-01's own schema changes and restores the pre-existing index name.
