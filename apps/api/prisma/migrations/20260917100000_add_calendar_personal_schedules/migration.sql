-- CreateEnum
CREATE TYPE "calendar_entry_type" AS ENUM ('EVENT', 'TASK', 'MEETING', 'PROJECT', 'CAMPAIGN', 'PERSONAL', 'REMINDER');

-- CreateTable
CREATE TABLE "calendar_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "calendar_entry_type" NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6),
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "task_id" UUID,
    "project_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_entries_user_id_event_id_key" ON "calendar_entries"("user_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_entries_user_id_task_id_key" ON "calendar_entries"("user_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_entries_user_id_project_id_key" ON "calendar_entries"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "calendar_entries_user_id_start_at_idx" ON "calendar_entries"("user_id", "start_at");

-- CreateIndex
CREATE INDEX "calendar_entries_type_start_at_idx" ON "calendar_entries"("type", "start_at");

-- CreateIndex
CREATE INDEX "calendar_entries_created_by_id_idx" ON "calendar_entries"("created_by_id");

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A calendar entry has a meaningful title and optional description. Stored
-- instants are UTC and the end cannot precede the start.
ALTER TABLE "calendar_entries"
    ADD CONSTRAINT "calendar_entries_title_not_blank"
    CHECK (btrim("title") <> '');

ALTER TABLE "calendar_entries"
    ADD CONSTRAINT "calendar_entries_description_not_blank"
    CHECK ("description" IS NULL OR btrim("description") <> '');

ALTER TABLE "calendar_entries"
    ADD CONSTRAINT "calendar_entries_schedule_ordered"
    CHECK ("end_at" IS NULL OR "end_at" >= "start_at");

-- A projection must reference exactly its own concrete source. Personal plans
-- and reminders are calendar-owned. The SRS vocabulary reserves MEETING and
-- CAMPAIGN, but no row of either type is valid until their modules introduce
-- concrete foreign keys; unchecked entity-type/id references are forbidden.
ALTER TABLE "calendar_entries"
    ADD CONSTRAINT "calendar_entries_source_matches_type"
    CHECK (
        ("type" = 'EVENT' AND "event_id" IS NOT NULL AND "task_id" IS NULL AND "project_id" IS NULL)
        OR ("type" = 'TASK' AND "event_id" IS NULL AND "task_id" IS NOT NULL AND "project_id" IS NULL)
        OR ("type" = 'PROJECT' AND "event_id" IS NULL AND "task_id" IS NULL AND "project_id" IS NOT NULL)
        OR ("type" IN ('PERSONAL', 'REMINDER') AND "event_id" IS NULL AND "task_id" IS NULL AND "project_id" IS NULL)
    );
