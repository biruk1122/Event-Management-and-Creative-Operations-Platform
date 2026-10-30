-- Documents and letter attachments are explicit file owners too. Keep the
-- deferred orphan check, but recognize the owners introduced by EMP-02.
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

    PERFORM 1 FROM "managed_files"
    WHERE "id" IN (affected_file_id, previous_file_id)
    ORDER BY "id" FOR UPDATE;

    IF EXISTS (
        SELECT 1 FROM "managed_files" AS "managed_file"
        WHERE "managed_file"."id" IN (affected_file_id, previous_file_id)
          AND "managed_file"."state" = 'AVAILABLE'
          AND NOT EXISTS (SELECT 1 FROM "workspace_file_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "task_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "message_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "talents" WHERE "profile_image_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "expense_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "report_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "letter_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "documents" WHERE "managed_file_id" = "managed_file"."id")
    ) THEN
        RAISE EXCEPTION 'available managed files require an explicit attachment'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'managed_files_available_require_attachment';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Check both old and new file IDs when a link changes, not just when the
-- file itself changes. Removing the last parent still requires making the
-- file unavailable in the same transaction.
CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_document_change"
    AFTER INSERT OR UPDATE OR DELETE ON "documents"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_letter_attachment_change"
    AFTER INSERT OR UPDATE OR DELETE ON "letter_attachments"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();
