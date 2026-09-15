-- CreateEnum
CREATE TYPE "conversation_type" AS ENUM ('DIRECT', 'GROUP', 'CHANNEL');

-- CreateEnum
CREATE TYPE "channel_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "managed_files" ADD COLUMN     "intent_conversation_id" UUID;

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "type" "conversation_type" NOT NULL,
    "name" TEXT,
    "visibility" "channel_visibility",
    "workspace_id" UUID,
    "department_id" UUID,
    "team_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_message_id" UUID,
    "last_read_at" TIMESTAMPTZ(6),

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "conversation_id" UUID NOT NULL,
    "author_id" UUID,
    "parent_message_id" UUID,
    "content" TEXT NOT NULL,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "pinned_at" TIMESTAMPTZ(6),
    "pinned_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_mentions" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "message_id" UUID NOT NULL,
    "managed_file_id" UUID NOT NULL,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_type_idx" ON "conversations"("type");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_idx" ON "conversations"("workspace_id");

-- CreateIndex
CREATE INDEX "conversations_department_id_idx" ON "conversations"("department_id");

-- CreateIndex
CREATE INDEX "conversations_team_id_idx" ON "conversations"("team_id");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "conversation_members_last_read_message_id_idx" ON "conversation_members"("last_read_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_parent_message_id_idx" ON "messages"("parent_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_pinned_at_idx" ON "messages"("conversation_id", "pinned_at");

-- CreateIndex
CREATE INDEX "messages_author_id_idx" ON "messages"("author_id");

-- CreateIndex
CREATE INDEX "message_mentions_user_id_idx" ON "message_mentions"("user_id");

-- CreateIndex
CREATE INDEX "message_attachments_managed_file_id_idx" ON "message_attachments"("managed_file_id");

-- CreateIndex
CREATE INDEX "message_attachments_attached_by_id_idx" ON "message_attachments"("attached_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachments_message_id_managed_file_id_key" ON "message_attachments"("message_id", "managed_file_id");

-- CreateIndex
CREATE INDEX "managed_files_intent_conversation_id_idx" ON "managed_files"("intent_conversation_id");

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_conversation_id_fkey" FOREIGN KEY ("intent_conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_pinned_by_id_fkey" FOREIGN KEY ("pinned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A member's read cursor must point at a message in that same conversation.
-- A plain foreign key on last_read_message_id cannot cross-check that.
CREATE FUNCTION "conversation_members_read_cursor_same_conversation"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."last_read_message_id" IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM "messages"
            WHERE "id" = NEW."last_read_message_id"
              AND "conversation_id" = NEW."conversation_id"
        ) THEN
            RAISE EXCEPTION 'a read cursor must reference a message in the same conversation'
                USING ERRCODE = '23514',
                      CONSTRAINT = 'conversation_members_read_cursor_same_conversation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "conversation_members_read_cursor_same_conversation"
    BEFORE INSERT OR UPDATE OF "last_read_message_id", "conversation_id"
    ON "conversation_members"
    FOR EACH ROW
    EXECUTE FUNCTION "conversation_members_read_cursor_same_conversation"();

-- Channel-only fields (name, visibility) are set exactly when type = CHANNEL,
-- and never otherwise.
ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_channel_fields_consistent"
    CHECK (
        ("type" = 'CHANNEL' AND "name" IS NOT NULL AND "visibility" IS NOT NULL)
        OR ("type" <> 'CHANNEL' AND "name" IS NULL AND "visibility" IS NULL)
    );

-- A conversation's owner (workspace/department/team) exists only for
-- channels, and a channel has at most one owner - "approved general
-- purpose" channels (product vocabulary) have none.
ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_owner_valid"
    CHECK (
        (
            "type" <> 'CHANNEL'
            AND "workspace_id" IS NULL
            AND "department_id" IS NULL
            AND "team_id" IS NULL
        )
        OR (
            "type" = 'CHANNEL'
            AND (
                (CASE WHEN "workspace_id" IS NOT NULL THEN 1 ELSE 0 END)
                + (CASE WHEN "department_id" IS NOT NULL THEN 1 ELSE 0 END)
                + (CASE WHEN "team_id" IS NOT NULL THEN 1 ELSE 0 END)
            ) <= 1
        )
    );

-- Pinning marks prominence without changing ownership (product vocabulary);
-- the timestamp and actor are set or cleared together.
ALTER TABLE "messages"
    ADD CONSTRAINT "messages_pinned_fields_consistent"
    CHECK (("pinned_at" IS NULL) = ("pinned_by_id" IS NULL));

-- A reply must stay in the same conversation as its parent message. A plain
-- foreign key on parent_message_id cannot cross-check that, since it only
-- guarantees the parent row exists, not which conversation it belongs to.
CREATE FUNCTION "messages_reply_same_conversation"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."parent_message_id" IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM "messages"
            WHERE "id" = NEW."parent_message_id"
              AND "conversation_id" = NEW."conversation_id"
        ) THEN
            RAISE EXCEPTION 'a reply must belong to its parent message''s conversation'
                USING ERRCODE = '23514',
                      CONSTRAINT = 'messages_reply_same_conversation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "messages_reply_same_conversation"
    BEFORE INSERT OR UPDATE OF "parent_message_id", "conversation_id"
    ON "messages"
    FOR EACH ROW
    EXECUTE FUNCTION "messages_reply_same_conversation"();

-- A message may attach only an object the secure file lifecycle has already
-- verified and made AVAILABLE. Managed-file ownership and download checks
-- stay in the file module; this trigger prevents bypassing its finalization
-- gate. Mirrors task_attachments_require_available_file (TSK-01).
CREATE FUNCTION "message_attachments_require_available_file"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "managed_files"
        WHERE "id" = NEW."managed_file_id"
          AND "state" = 'AVAILABLE'
    ) THEN
        RAISE EXCEPTION 'message attachments require an available managed file'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'message_attachments_require_available_file';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "message_attachments_require_available_file"
    BEFORE INSERT OR UPDATE OF "managed_file_id"
    ON "message_attachments"
    FOR EACH ROW
    EXECUTE FUNCTION "message_attachments_require_available_file"();

-- Extend the file module's deferred parent invariant so a MessageAttachment
-- is itself a valid explicit authorization parent, mirroring the TSK-01
-- extension for TaskAttachment. This permits a message-only attachment to
-- finalize a file without inventing a workspace or task association, and
-- keeps an AVAILABLE object attached until a lifecycle transaction marks it
-- unavailable or moves it to another approved parent.
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
    ELSIF TG_OP = 'DELETE' THEN
        affected_file_id := OLD."managed_file_id";
    ELSE
        affected_file_id := NEW."managed_file_id";
        IF TG_OP = 'UPDATE' THEN
            previous_file_id := OLD."managed_file_id";
        END IF;
    END IF;

    -- Attachment parents span three tables. Serialize their deferred checks
    -- on the authoritative file rows so concurrent transactions cannot each
    -- remove a different last-visible parent and both commit. A stable id
    -- order also prevents attachment swaps from acquiring these locks in
    -- opposite orders.
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
    ) THEN
        RAISE EXCEPTION 'available managed files require an explicit attachment'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'managed_files_available_require_attachment';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_message_attachment_change"
    AFTER INSERT OR UPDATE OR DELETE
    ON "message_attachments"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();

-- Generalize the intent-parent exclusivity check (TSK-01) to the new
-- conversation-scoped intent parent: at most one of
-- workspace/task/conversation is set. Historical rows may have none.
ALTER TABLE "managed_files"
    DROP CONSTRAINT "managed_files_intent_parent_exclusive";

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_intent_parent_exclusive"
    CHECK (
        (CASE WHEN "intent_workspace_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_task_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_conversation_id" IS NOT NULL THEN 1 ELSE 0 END)
        <= 1
    );
