-- AlterTable
ALTER TABLE "managed_files" ADD COLUMN     "intent_report_id" UUID;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "report_attachments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "report_id" UUID NOT NULL,
    "managed_file_id" UUID NOT NULL,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_attachments_managed_file_id_idx" ON "report_attachments"("managed_file_id");

-- CreateIndex
CREATE INDEX "report_attachments_attached_by_id_idx" ON "report_attachments"("attached_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_attachments_report_id_managed_file_id_key" ON "report_attachments"("report_id", "managed_file_id");

-- CreateIndex
CREATE INDEX "managed_files_intent_report_id_idx" ON "managed_files"("intent_report_id");

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_report_id_fkey" FOREIGN KEY ("intent_report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Generalize the intent-parent exclusivity check to the new report-scoped
-- intent parent: at most one of workspace/task/conversation/talent/expense/
-- report is set. `intent_expense_id` was never added here when EOM-01
-- introduced it (a pre-existing gap outside this change's own scope) - it is
-- included now since this constraint is being redefined regardless.
ALTER TABLE "managed_files"
    DROP CONSTRAINT "managed_files_intent_parent_exclusive";

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_intent_parent_exclusive"
    CHECK (
        (CASE WHEN "intent_workspace_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_task_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_conversation_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_talent_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_expense_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_report_id" IS NOT NULL THEN 1 ELSE 0 END)
        <= 1
    );

-- Extend the managed-file deferred-parent invariant so `report_attachments`
-- is a recognized concrete parent, and add the same recognition for
-- `expense_attachments` - EOM-01 added that attachment table without ever
-- extending this function or giving it its own trigger, so an expense file
-- could be finalized to AVAILABLE and then immediately trip this constraint
-- (or, with no trigger bound to `expense_attachments` at all, silently never
-- be checked again once detached). Both are fixed together since this
-- function is being redefined regardless.
CREATE OR REPLACE FUNCTION "managed_files_available_require_attachment"()
RETURNS TRIGGER AS $$
DECLARE
    affected_file_id UUID;
    previous_file_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'managed_files' AND TG_OP = 'DELETE' THEN
        affected_file_id := OLD."id";
    ELSIF TG_TABLE_NAME = 'managed_files' THEN
        affected_file_id := NEW."id";
    ELSIF TG_TABLE_NAME = 'talents' AND TG_OP = 'DELETE' THEN
        affected_file_id := OLD."profile_image_id";
    ELSIF TG_TABLE_NAME = 'talents' THEN
        affected_file_id := NEW."profile_image_id";
        IF TG_OP = 'UPDATE' THEN
            previous_file_id := OLD."profile_image_id";
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        affected_file_id := OLD."managed_file_id";
    ELSE
        affected_file_id := NEW."managed_file_id";
        IF TG_OP = 'UPDATE' THEN
            previous_file_id := OLD."managed_file_id";
        END IF;
    END IF;

    PERFORM 1
    FROM "managed_files"
    WHERE "id" IN (affected_file_id, previous_file_id)
    ORDER BY "id"
    FOR UPDATE;

    IF EXISTS (
        SELECT 1
        FROM "managed_files" AS "managed_file"
        WHERE "managed_file"."id" IN (affected_file_id, previous_file_id)
          AND "managed_file"."state" = 'AVAILABLE'
          AND NOT EXISTS (
              SELECT 1
              FROM "workspace_file_attachments"
              WHERE "managed_file_id" = "managed_file"."id"
          )
          AND NOT EXISTS (
              SELECT 1
              FROM "task_attachments"
              WHERE "managed_file_id" = "managed_file"."id"
          )
          AND NOT EXISTS (
              SELECT 1
              FROM "message_attachments"
              WHERE "managed_file_id" = "managed_file"."id"
          )
          AND NOT EXISTS (
              SELECT 1
              FROM "talents"
              WHERE "profile_image_id" = "managed_file"."id"
          )
          AND NOT EXISTS (
              SELECT 1
              FROM "expense_attachments"
              WHERE "managed_file_id" = "managed_file"."id"
          )
          AND NOT EXISTS (
              SELECT 1
              FROM "report_attachments"
              WHERE "managed_file_id" = "managed_file"."id"
          )
    ) THEN
        RAISE EXCEPTION 'available managed files require an explicit attachment'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'managed_files_available_require_attachment';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_expense_attachment_change"
    AFTER INSERT OR UPDATE OR DELETE
    ON "expense_attachments"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_report_attachment_change"
    AFTER INSERT OR UPDATE OR DELETE
    ON "report_attachments"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();
