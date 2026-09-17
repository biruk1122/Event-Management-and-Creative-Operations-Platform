-- CreateEnum
CREATE TYPE "todo_type" AS ENUM ('PERSONAL', 'WORK', 'REMINDER', 'QUICK_NOTE', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "todo_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "todo_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "todos" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "todo_type" NOT NULL DEFAULT 'PERSONAL',
    "priority" "todo_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "todo_status" NOT NULL DEFAULT 'NOT_STARTED',
    "due_date" DATE,
    "due_time" TIME(6),
    "related_event_id" UUID,
    "related_project_id" UUID,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_reminders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "todo_id" UUID NOT NULL,
    "reminder_at" TIMESTAMPTZ(6) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todo_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "todos_user_id_status_due_date_idx" ON "todos"("user_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "todos_user_id_type_idx" ON "todos"("user_id", "type");

-- CreateIndex
CREATE INDEX "todos_related_event_id_idx" ON "todos"("related_event_id");

-- CreateIndex
CREATE INDEX "todos_related_project_id_idx" ON "todos"("related_project_id");

-- CreateIndex
CREATE INDEX "todos_created_by_id_idx" ON "todos"("created_by_id");

-- CreateIndex
CREATE INDEX "todo_reminders_sent_reminder_at_idx" ON "todo_reminders"("sent", "reminder_at");

-- CreateIndex
CREATE UNIQUE INDEX "todo_reminders_todo_id_reminder_at_key" ON "todo_reminders"("todo_id", "reminder_at");

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_related_event_id_fkey" FOREIGN KEY ("related_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_related_project_id_fkey" FOREIGN KEY ("related_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_reminders" ADD CONSTRAINT "todo_reminders_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "todos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A todo has a meaningful title and optional description, matching every
-- other free-text model in this schema (see e.g. calendar_entries).
ALTER TABLE "todos"
    ADD CONSTRAINT "todos_title_not_blank"
    CHECK (btrim("title") <> '');

ALTER TABLE "todos"
    ADD CONSTRAINT "todos_description_not_blank"
    CHECK ("description" IS NULL OR btrim("description") <> '');

-- A due time without a due date has nothing to attach to.
ALTER TABLE "todos"
    ADD CONSTRAINT "todos_due_time_requires_due_date"
    CHECK ("due_time" IS NULL OR "due_date" IS NOT NULL);
