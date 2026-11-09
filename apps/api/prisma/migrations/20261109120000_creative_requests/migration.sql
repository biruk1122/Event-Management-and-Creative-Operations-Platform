-- EVE-232: creative requests from one department (Promotion) to another
-- (Production), with append-only feedback, reference and deliverable files,
-- and notifications.
--
-- Additive only. No existing row is rewritten. Three existing constraints are
-- redefined to recognize the new parent, each keeping every term it has today.

-- Enums.
CREATE TYPE "creative_asset_type" AS ENUM ('POSTER', 'FLYER', 'BANNER', 'EVENT_GRAPHIC', 'VIDEO', 'ADVERTISING_CONTENT', 'ARTIST_MATERIAL', 'OTHER');

CREATE TYPE "creative_request_status" AS ENUM ('SUBMITTED', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'DELIVERED', 'APPROVED', 'CHANGES_REQUESTED', 'CANCELLED');

CREATE TYPE "creative_request_file_kind" AS ENUM ('REFERENCE', 'DELIVERABLE');

-- New notification types. None is used in this migration, so adding them in
-- the same transaction is safe.
ALTER TYPE "notification_type" ADD VALUE 'CREATIVE_REQUEST_SUBMITTED';
ALTER TYPE "notification_type" ADD VALUE 'CREATIVE_REQUEST_ACCEPTED';
ALTER TYPE "notification_type" ADD VALUE 'CREATIVE_REQUEST_DECLINED';
ALTER TYPE "notification_type" ADD VALUE 'CREATIVE_REQUEST_DELIVERED';
ALTER TYPE "notification_type" ADD VALUE 'CREATIVE_REQUEST_REVIEWED';

-- The request.
CREATE TABLE "creative_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "asset_type" "creative_asset_type" NOT NULL,
    "requirements" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6),
    "status" "creative_request_status" NOT NULL DEFAULT 'SUBMITTED',
    "requesting_department_id" UUID NOT NULL,
    "target_department_id" UUID NOT NULL,
    "campaign_id" UUID,
    "event_id" UUID,
    "task_id" UUID,
    "requested_by_id" UUID,
    "decline_reason" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "creative_requests_title_not_blank" CHECK (btrim("title") <> ''),
    CONSTRAINT "creative_requests_requirements_not_blank" CHECK (btrim("requirements") <> ''),
    -- A department never sends a request to itself.
    CONSTRAINT "creative_requests_departments_differ"
        CHECK ("requesting_department_id" <> "target_department_id"),
    -- A declined request always says why; no other status carries a reason.
    CONSTRAINT "creative_requests_decline_reason"
        CHECK (
            ("status" = 'DECLINED' AND "decline_reason" IS NOT NULL AND btrim("decline_reason") <> '')
            OR ("status" <> 'DECLINED' AND "decline_reason" IS NULL)
        )
);

CREATE UNIQUE INDEX "creative_requests_task_id_key" ON "creative_requests"("task_id");
CREATE INDEX "creative_requests_requesting_department_id_status_created_a_idx" ON "creative_requests"("requesting_department_id", "status", "created_at");
CREATE INDEX "creative_requests_target_department_id_status_created_at_idx" ON "creative_requests"("target_department_id", "status", "created_at");
CREATE INDEX "creative_requests_campaign_id_idx" ON "creative_requests"("campaign_id");
CREATE INDEX "creative_requests_event_id_idx" ON "creative_requests"("event_id");
CREATE INDEX "creative_requests_requested_by_id_idx" ON "creative_requests"("requested_by_id");

ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_requesting_department_id_fkey" FOREIGN KEY ("requesting_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_target_department_id_fkey" FOREIGN KEY ("target_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "creative_requests" ADD CONSTRAINT "creative_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only feedback.
CREATE TABLE "creative_request_feedback" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creative_request_id" UUID NOT NULL,
    "author_id" UUID,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_request_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "creative_request_feedback_note_not_blank" CHECK (btrim("note") <> '')
);

CREATE INDEX "creative_request_feedback_creative_request_id_created_at_idx" ON "creative_request_feedback"("creative_request_id", "created_at");
CREATE INDEX "creative_request_feedback_author_id_idx" ON "creative_request_feedback"("author_id");

ALTER TABLE "creative_request_feedback" ADD CONSTRAINT "creative_request_feedback_creative_request_id_fkey" FOREIGN KEY ("creative_request_id") REFERENCES "creative_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "creative_request_feedback" ADD CONSTRAINT "creative_request_feedback_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rows are never edited. Removal happens only through the request's cascade,
-- and the author's SET NULL is the one update a row may receive.
CREATE FUNCTION "creative_request_feedback_append_only"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" = OLD."id"
       AND NEW."creative_request_id" = OLD."creative_request_id"
       AND NEW."note" = OLD."note"
       AND NEW."created_at" = OLD."created_at"
       AND OLD."author_id" IS NOT NULL
       AND NEW."author_id" IS NULL THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'creative request feedback is append-only'
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'creative_request_feedback_append_only';
END;
$$;

CREATE TRIGGER "creative_request_feedback_append_only" BEFORE UPDATE ON "creative_request_feedback"
    FOR EACH ROW EXECUTE FUNCTION "creative_request_feedback_append_only"();

-- Reference and deliverable files.
CREATE TABLE "creative_request_attachments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creative_request_id" UUID NOT NULL,
    "managed_file_id" UUID NOT NULL,
    "kind" "creative_request_file_kind" NOT NULL,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_request_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creative_request_attachments_managed_file_id_idx" ON "creative_request_attachments"("managed_file_id");
CREATE INDEX "creative_request_attachments_attached_by_id_idx" ON "creative_request_attachments"("attached_by_id");
CREATE UNIQUE INDEX "creative_request_attachments_creative_request_id_managed_fi_key" ON "creative_request_attachments"("creative_request_id", "managed_file_id");

ALTER TABLE "creative_request_attachments" ADD CONSTRAINT "creative_request_attachments_creative_request_id_fkey" FOREIGN KEY ("creative_request_id") REFERENCES "creative_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "creative_request_attachments" ADD CONSTRAINT "creative_request_attachments_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_request_attachments" ADD CONSTRAINT "creative_request_attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Managed files: the creative request upload intent.
ALTER TABLE "managed_files" ADD COLUMN "intent_creative_request_id" UUID;
CREATE INDEX "managed_files_intent_creative_request_id_idx" ON "managed_files"("intent_creative_request_id");
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_creative_request_id_fkey" FOREIGN KEY ("intent_creative_request_id") REFERENCES "creative_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one intent parent. The constraint last redefined by
-- 20261014194427_report_description_and_attachments never gained the letter,
-- document and leave request intents added after it. They are included now,
-- since the constraint is redefined regardless, together with the new one.
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
        + (CASE WHEN "intent_letter_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_document_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_leave_request_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_creative_request_id" IS NOT NULL THEN 1 ELSE 0 END)
        <= 1
    );

-- An available file needs an explicit attachment. Same function as
-- 20261021213000_recognize_document_letter_file_attachments, with
-- creative_request_attachments recognized as a concrete parent.
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
          AND NOT EXISTS (SELECT 1 FROM "creative_request_attachments" WHERE "managed_file_id" = "managed_file"."id")
    ) THEN
        RAISE EXCEPTION 'available managed files require an explicit attachment'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'managed_files_available_require_attachment';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_creative_request_attachment_change"
    AFTER INSERT OR UPDATE OR DELETE ON "creative_request_attachments"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();

-- Notifications: the creative request target.
ALTER TABLE "notifications" ADD COLUMN "creative_request_id" UUID;
CREATE INDEX "notifications_creative_request_id_idx" ON "notifications"("creative_request_id");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_creative_request_id_fkey" FOREIGN KEY ("creative_request_id") REFERENCES "creative_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one target. Same terms as 20261020150000_letter_document_shared_notifications,
-- plus creative_request_id.
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_target_at_most_one";
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_target_at_most_one"
    CHECK (
        (CASE WHEN "task_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "message_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "event_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "meeting_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "expense_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "report_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "partner_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "letter_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "document_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "creative_request_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );
