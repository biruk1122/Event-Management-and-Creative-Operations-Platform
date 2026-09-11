-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "status" "project_status" NOT NULL DEFAULT 'PLANNED',
    "event_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_key" ON "projects"("workspace_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_event_id_idx" ON "projects"("event_id");

-- CreateIndex
CREATE INDEX "projects_start_at_idx" ON "projects"("start_at");

-- CreateIndex
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints, so they are added here by hand,
-- matching the *_not_blank pattern from DEP-01 / TEAM-01 / WSP-01 / EVT-01.

-- A project name is always real text. A present description is held to the
-- same rule; NULL means "not provided".
ALTER TABLE "projects"
    ADD CONSTRAINT "projects_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_description_not_blank"
    CHECK ("description" IS NULL OR btrim("description") <> '');

-- The schedule is coherent: when both ends are set, the project does not end
-- before it starts.
ALTER TABLE "projects"
    ADD CONSTRAINT "projects_schedule_ordered"
    CHECK (
        "start_at" IS NULL
        OR "end_at" IS NULL
        OR "end_at" >= "start_at"
    );
