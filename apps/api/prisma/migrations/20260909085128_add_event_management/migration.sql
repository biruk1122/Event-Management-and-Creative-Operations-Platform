-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('FILM_PREMIERE', 'CONCERT', 'ALBUM_RELEASE', 'PRODUCT_LAUNCH', 'CORPORATE_EVENT', 'PROMOTIONAL_EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "event_type" "event_type" NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "location" TEXT,
    "organizer_name" TEXT,
    "status" "event_status" NOT NULL DEFAULT 'PLANNING',
    "budget_amount" DECIMAL(14,2),
    "budget_currency" CHAR(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_workspace_id_key" ON "events"("workspace_id");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE INDEX "events_start_at_idx" ON "events"("start_at");

-- CreateIndex
CREATE INDEX "events_created_by_id_idx" ON "events"("created_by_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints, so they are added here by hand,
-- matching the *_not_blank pattern from DEP-01 / TEAM-01 / WSP-01.

-- An event name is always real text. A present description, location, or
-- organizer name is held to the same rule; NULL means "not provided".
ALTER TABLE "events"
    ADD CONSTRAINT "events_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "events"
    ADD CONSTRAINT "events_description_not_blank"
    CHECK ("description" IS NULL OR btrim("description") <> '');

ALTER TABLE "events"
    ADD CONSTRAINT "events_location_not_blank"
    CHECK ("location" IS NULL OR btrim("location") <> '');

ALTER TABLE "events"
    ADD CONSTRAINT "events_organizer_name_not_blank"
    CHECK ("organizer_name" IS NULL OR btrim("organizer_name") <> '');

-- The schedule is coherent: when both ends are set, the event does not end
-- before it starts.
ALTER TABLE "events"
    ADD CONSTRAINT "events_schedule_ordered"
    CHECK (
        "start_at" IS NULL
        OR "end_at" IS NULL
        OR "end_at" >= "start_at"
    );

-- A budget is all-or-nothing: the amount and its ISO-4217 currency code are
-- set together, the amount is non-negative, and the code is three upper-case
-- letters. Supported currencies, rounding, and the organization default are
-- an application concern (OD-14).
ALTER TABLE "events"
    ADD CONSTRAINT "events_budget_amount_and_currency"
    CHECK (
        ("budget_amount" IS NULL AND "budget_currency" IS NULL)
        OR (
            "budget_amount" IS NOT NULL
            AND "budget_amount" >= 0
            AND "budget_currency" IS NOT NULL
            AND "budget_currency" ~ '^[A-Z]{3}$'
        )
    );
