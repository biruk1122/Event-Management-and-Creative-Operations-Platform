-- CreateEnum
CREATE TYPE "talent_type" AS ENUM ('ARTIST', 'INFLUENCER', 'ACTOR', 'MUSICIAN', 'MODEL', 'PRESENTER', 'CONTENT_CREATOR');

-- CreateEnum
CREATE TYPE "talent_availability" AS ENUM ('AVAILABLE', 'ASSIGNED', 'UNAVAILABLE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "talent_assignment_status" AS ENUM ('ASSIGNED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "talents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "full_name" TEXT NOT NULL,
    "type" "talent_type" NOT NULL,
    "profile_image_id" UUID,
    "email" TEXT,
    "phone" TEXT,
    "biography" TEXT,
    "availability" "talent_availability" NOT NULL DEFAULT 'AVAILABLE',
    "manager_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_social_links" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "talent_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_schedules" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "talent_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talent_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_talents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_id" UUID NOT NULL,
    "talent_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" "talent_assignment_status" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_talents_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "managed_files" ADD COLUMN "intent_talent_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "talents_profile_image_id_key" ON "talents"("profile_image_id");

-- CreateIndex
CREATE INDEX "talents_availability_full_name_idx" ON "talents"("availability", "full_name");

-- CreateIndex
CREATE INDEX "talents_type_availability_idx" ON "talents"("type", "availability");

-- CreateIndex
CREATE INDEX "talents_manager_id_idx" ON "talents"("manager_id");

-- CreateIndex
CREATE INDEX "talents_email_idx" ON "talents"("email");

-- CreateIndex
CREATE INDEX "managed_files_intent_talent_id_idx" ON "managed_files"("intent_talent_id");

-- CreateIndex
CREATE UNIQUE INDEX "talent_social_links_talent_id_url_key" ON "talent_social_links"("talent_id", "url");

-- CreateIndex
CREATE INDEX "talent_social_links_talent_id_label_idx" ON "talent_social_links"("talent_id", "label");

-- CreateIndex
CREATE INDEX "talent_schedules_talent_id_start_at_end_at_idx" ON "talent_schedules"("talent_id", "start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_talents_event_id_talent_id_key" ON "event_talents"("event_id", "talent_id");

-- CreateIndex
CREATE INDEX "event_talents_event_id_status_idx" ON "event_talents"("event_id", "status");

-- CreateIndex
CREATE INDEX "event_talents_talent_id_status_idx" ON "event_talents"("talent_id", "status");

-- AddForeignKey
ALTER TABLE "talents" ADD CONSTRAINT "talents_profile_image_id_fkey" FOREIGN KEY ("profile_image_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talents" ADD CONSTRAINT "talents_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_talent_id_fkey" FOREIGN KEY ("intent_talent_id") REFERENCES "talents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_social_links" ADD CONSTRAINT "talent_social_links_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talent_schedules" ADD CONSTRAINT "talent_schedules_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_talents" ADD CONSTRAINT "event_talents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_talents" ADD CONSTRAINT "event_talents_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Profile and assignment text is meaningful when present.
ALTER TABLE "talents"
    ADD CONSTRAINT "talents_full_name_not_blank"
    CHECK (btrim("full_name") <> '');

ALTER TABLE "talents"
    ADD CONSTRAINT "talents_email_not_blank"
    CHECK ("email" IS NULL OR btrim("email") <> '');

ALTER TABLE "talents"
    ADD CONSTRAINT "talents_phone_not_blank"
    CHECK ("phone" IS NULL OR btrim("phone") <> '');

ALTER TABLE "talents"
    ADD CONSTRAINT "talents_biography_not_blank"
    CHECK ("biography" IS NULL OR btrim("biography") <> '');

ALTER TABLE "talent_social_links"
    ADD CONSTRAINT "talent_social_links_label_not_blank"
    CHECK (btrim("label") <> '');

ALTER TABLE "talent_social_links"
    ADD CONSTRAINT "talent_social_links_url_not_blank"
    CHECK (btrim("url") <> '');

ALTER TABLE "talent_schedules"
    ADD CONSTRAINT "talent_schedules_title_not_blank"
    CHECK (btrim("title") <> '');

ALTER TABLE "talent_schedules"
    ADD CONSTRAINT "talent_schedules_time_order"
    CHECK ("end_at" > "start_at");

ALTER TABLE "event_talents"
    ADD CONSTRAINT "event_talents_role_not_blank"
    CHECK (btrim("role") <> '');

-- A talent-scoped upload intent is an explicit authorization parent. Keep it
-- mutually exclusive with the existing workspace, task, and conversation
-- parents; historical rows may still have none.
ALTER TABLE "managed_files"
    DROP CONSTRAINT "managed_files_intent_parent_exclusive";

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_intent_parent_exclusive"
    CHECK (
        (CASE WHEN "intent_workspace_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_task_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_conversation_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_talent_id" IS NOT NULL THEN 1 ELSE 0 END)
        <= 1
    );

-- A profile can reference only a file that has completed the secure upload
-- lifecycle. This mirrors the concrete workspace/task/message attachment
-- checks without exposing storage details on Talent.
CREATE FUNCTION "talent_profile_images_require_available_file"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."profile_image_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM "managed_files"
        WHERE "id" = NEW."profile_image_id"
          AND "state" = 'AVAILABLE'
    ) THEN
        RAISE EXCEPTION 'talent profile images require an available managed file'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'talent_profile_images_require_available_file';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "talent_profile_images_require_available_file"
    BEFORE INSERT OR UPDATE OF "profile_image_id"
    ON "talents"
    FOR EACH ROW
    EXECUTE FUNCTION "talent_profile_images_require_available_file"();

-- Extend the managed-file deferred-parent invariant so the profile-image
-- relation is a concrete approved parent. Locking the authoritative file rows
-- preserves the existing concurrent last-parent-removal protection.
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
    ) THEN
        RAISE EXCEPTION 'available managed files require an explicit attachment'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'managed_files_available_require_attachment';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_talent_change"
    AFTER INSERT OR UPDATE OR DELETE
    ON "talents"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();
