-- CreateEnum
CREATE TYPE "campaign_type" AS ENUM ('MARKETING', 'PROMOTION');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "campaign_activity_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "campaign_type" "campaign_type" NOT NULL,
    "description" TEXT,
    "audience" TEXT,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "status" "campaign_status" NOT NULL DEFAULT 'PLANNED',
    "event_id" UUID,
    "product_name" TEXT,
    "budget_amount" DECIMAL(14,2),
    "budget_currency" CHAR(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_activities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "campaign_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "status" "campaign_activity_status" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_workspace_id_key" ON "campaigns"("workspace_id");

-- CreateIndex
CREATE INDEX "campaigns_campaign_type_status_idx" ON "campaigns"("campaign_type", "status");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_event_id_idx" ON "campaigns"("event_id");

-- CreateIndex
CREATE INDEX "campaigns_start_at_idx" ON "campaigns"("start_at");

-- CreateIndex
CREATE INDEX "campaigns_created_by_id_idx" ON "campaigns"("created_by_id");

-- CreateIndex
CREATE INDEX "campaign_activities_campaign_id_status_idx" ON "campaign_activities"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_activities_campaign_id_start_at_idx" ON "campaign_activities"("campaign_id", "start_at");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activities_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Campaign and activity text is meaningful when present.
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_description_not_blank"
    CHECK ("description" IS NULL OR btrim("description") <> '');

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_audience_not_blank"
    CHECK ("audience" IS NULL OR btrim("audience") <> '');

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_product_name_not_blank"
    CHECK ("product_name" IS NULL OR btrim("product_name") <> '');

ALTER TABLE "campaign_activities"
    ADD CONSTRAINT "campaign_activities_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "campaign_activities"
    ADD CONSTRAINT "campaign_activities_description_not_blank"
    CHECK ("description" IS NULL OR btrim("description") <> '');

-- When both bounds are set, a campaign or activity may not end before it
-- starts. Either bound may be unset while the work is still being planned.
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_end_after_start"
    CHECK (
        "start_at" IS NULL
        OR "end_at" IS NULL
        OR "end_at" >= "start_at"
    );

ALTER TABLE "campaign_activities"
    ADD CONSTRAINT "campaign_activities_end_after_start"
    CHECK (
        "start_at" IS NULL
        OR "end_at" IS NULL
        OR "end_at" >= "start_at"
    );

-- A budget is all-or-nothing: the amount and its ISO-4217 currency code are
-- set together, the amount is non-negative, and the code is three upper-case
-- letters. Supported currencies, rounding, and the organization default are
-- an application concern (OD-14).
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_budget_amount_and_currency"
    CHECK (
        ("budget_amount" IS NULL AND "budget_currency" IS NULL)
        OR (
            "budget_amount" IS NOT NULL
            AND "budget_amount" >= 0
            AND "budget_currency" IS NOT NULL
            AND "budget_currency" ~ '^[A-Z]{3}$'
        )
    );

-- A campaign has one related subject or none: an event (enforced by the
-- foreign key) or a product name, never both.
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_single_related_subject"
    CHECK ("event_id" IS NULL OR "product_name" IS NULL);
