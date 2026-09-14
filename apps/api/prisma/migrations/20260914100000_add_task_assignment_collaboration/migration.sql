-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'UNDER_REVIEW', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "task_review_outcome" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "task_activity_type" AS ENUM (
    'CREATED',
    'UPDATED',
    'ASSIGNEE_ADDED',
    'ASSIGNEE_REMOVED',
    'STATUS_CHANGED',
    'PROGRESS_UPDATED',
    'COMMENT_ADDED',
    'ATTACHMENT_ADDED',
    'REVIEW_RECORDED'
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID,
    "department_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "start_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID NOT NULL,
    "author_id" UUID,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comment_mentions" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comment_mentions_pkey" PRIMARY KEY ("comment_id", "user_id")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID NOT NULL,
    "managed_file_id" UUID NOT NULL,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_reviews" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "outcome" "task_review_outcome" NOT NULL,
    "note" TEXT,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_activities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" "task_activity_type" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_workspace_id_status_updated_at_idx" ON "tasks"("workspace_id", "status", "updated_at");
CREATE INDEX "tasks_department_id_status_updated_at_idx" ON "tasks"("department_id", "status", "updated_at");
CREATE INDEX "tasks_status_due_at_idx" ON "tasks"("status", "due_at");
CREATE INDEX "tasks_start_at_idx" ON "tasks"("start_at");
CREATE INDEX "tasks_due_at_idx" ON "tasks"("due_at");
CREATE INDEX "tasks_priority_due_at_idx" ON "tasks"("priority", "due_at");
CREATE INDEX "tasks_created_by_id_idx" ON "tasks"("created_by_id");

CREATE UNIQUE INDEX "task_assignments_task_id_user_id_key" ON "task_assignments"("task_id", "user_id");
CREATE INDEX "task_assignments_user_id_assigned_at_idx" ON "task_assignments"("user_id", "assigned_at");
CREATE INDEX "task_assignments_assigned_by_id_idx" ON "task_assignments"("assigned_by_id");

CREATE INDEX "task_comments_task_id_created_at_idx" ON "task_comments"("task_id", "created_at");
CREATE INDEX "task_comments_author_id_idx" ON "task_comments"("author_id");
CREATE INDEX "task_comment_mentions_user_id_idx" ON "task_comment_mentions"("user_id");

CREATE UNIQUE INDEX "task_attachments_task_id_managed_file_id_key" ON "task_attachments"("task_id", "managed_file_id");
CREATE INDEX "task_attachments_managed_file_id_idx" ON "task_attachments"("managed_file_id");
CREATE INDEX "task_attachments_attached_by_id_idx" ON "task_attachments"("attached_by_id");

CREATE INDEX "task_reviews_task_id_reviewed_at_idx" ON "task_reviews"("task_id", "reviewed_at");
CREATE INDEX "task_reviews_reviewer_id_idx" ON "task_reviews"("reviewer_id");

CREATE INDEX "task_activities_task_id_occurred_at_idx" ON "task_activities"("task_id", "occurred_at");
CREATE INDEX "task_activities_actor_id_idx" ON "task_activities"("actor_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_comment_mentions" ADD CONSTRAINT "task_comment_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "task_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comment_mentions" ADD CONSTRAINT "task_comment_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot express these material domain invariants. Department-only
-- tasks and connected-workspace tasks are both valid, but an ownerless task is
-- not. Text values cannot be blank, progress is a percentage, and calendar
-- bounds must be coherent when both are present.
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_has_owner"
    CHECK ("workspace_id" IS NOT NULL OR "department_id" IS NOT NULL);

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_title_not_blank"
    CHECK (btrim("title") <> '');

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_description_not_blank"
    CHECK ("description" IS NULL OR btrim("description") <> '');

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_progress_in_range"
    CHECK ("progress" BETWEEN 0 AND 100);

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_schedule_ordered"
    CHECK ("start_at" IS NULL OR "due_at" IS NULL OR "due_at" >= "start_at");

ALTER TABLE "task_comments"
    ADD CONSTRAINT "task_comments_content_not_blank"
    CHECK (btrim("content") <> '');

ALTER TABLE "task_reviews"
    ADD CONSTRAINT "task_reviews_note_not_blank"
    CHECK ("note" IS NULL OR btrim("note") <> '');

ALTER TABLE "task_activities"
    ADD CONSTRAINT "task_activities_details_is_object"
    CHECK (jsonb_typeof("details") = 'object');

-- A task may attach only an object that the secure file lifecycle has already
-- verified and made AVAILABLE. Managed-file ownership and download checks stay
-- in the file module; this trigger prevents bypassing its finalization gate.
CREATE FUNCTION "task_attachments_require_available_file"()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "managed_files"
        WHERE "id" = NEW."managed_file_id"
          AND "state" = 'AVAILABLE'
    ) THEN
        RAISE EXCEPTION 'task attachments require an available managed file'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'task_attachments_require_available_file';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "task_attachments_require_available_file"
    BEFORE INSERT OR UPDATE OF "managed_file_id"
    ON "task_attachments"
    FOR EACH ROW
    EXECUTE FUNCTION "task_attachments_require_available_file"();

-- Extend the file module's deferred parent invariant so a TaskAttachment is
-- itself a valid explicit authorization parent. This permits department-only
-- tasks to finalize files without inventing a workspace association and keeps
-- an AVAILABLE object attached until a lifecycle transaction marks it
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

    -- Attachment parents span two tables. Serialize their deferred checks on
    -- the authoritative file rows so concurrent transactions cannot each
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
    ) THEN
        RAISE EXCEPTION 'available managed files require an explicit attachment'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'managed_files_available_require_attachment';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_task_attachment_change"
    AFTER INSERT OR UPDATE OR DELETE
    ON "task_attachments"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();
