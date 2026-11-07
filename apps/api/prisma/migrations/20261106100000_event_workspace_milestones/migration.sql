-- Event workspace: a human reference number on every event (EVT-###) and
-- event milestones. Additive only: no existing row or column is removed.

-- The reference number uses the same single-row counter as task numbers
-- (20261102100200_task_number_counter): Prisma cannot model a sequence.
CREATE TABLE "event_number_counters" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_value" INTEGER NOT NULL,
    CONSTRAINT "event_number_counters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_number_counters_single_row" CHECK ("id" = 1),
    CONSTRAINT "event_number_counters_last_value_non_negative" CHECK ("last_value" >= 0)
);

-- Existing events, archived ones included, are numbered oldest first.
ALTER TABLE "events" ADD COLUMN "event_number" INTEGER;

UPDATE "events" AS e
SET "event_number" = numbered."number"
FROM (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS "number"
    FROM "events"
) AS numbered
WHERE e."id" = numbered."id";

INSERT INTO "event_number_counters" ("id", "last_value")
VALUES (1, COALESCE((SELECT MAX("event_number") FROM "events"), 0));

CREATE FUNCTION "next_event_number"() RETURNS INTEGER
LANGUAGE sql
VOLATILE
AS $$
    UPDATE "event_number_counters"
    SET "last_value" = "last_value" + 1
    WHERE "id" = 1
    RETURNING "last_value";
$$;

ALTER TABLE "events" ALTER COLUMN "event_number" SET DEFAULT next_event_number();
ALTER TABLE "events" ALTER COLUMN "event_number" SET NOT NULL;
CREATE UNIQUE INDEX "events_event_number_key" ON "events"("event_number");

CREATE TYPE "event_milestone_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "event_milestones" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATE NOT NULL,
    "status" "event_milestone_status" NOT NULL DEFAULT 'NOT_STARTED',
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_milestones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_milestones_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "event_milestones_description_not_blank" CHECK (
        "description" IS NULL OR btrim("description") <> ''
    )
);

CREATE INDEX "event_milestones_event_id_due_date_idx" ON "event_milestones"("event_id", "due_date");
CREATE INDEX "event_milestones_created_by_id_idx" ON "event_milestones"("created_by_id");
CREATE INDEX "event_milestones_updated_by_id_idx" ON "event_milestones"("updated_by_id");

ALTER TABLE "event_milestones"
    ADD CONSTRAINT "event_milestones_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_milestones"
    ADD CONSTRAINT "event_milestones_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_milestones"
    ADD CONSTRAINT "event_milestones_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
