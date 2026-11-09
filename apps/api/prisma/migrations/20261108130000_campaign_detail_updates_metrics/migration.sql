-- EVE-231: campaign detail, append-only updates log and recorded metrics.
--
-- Additive only. Existing campaigns keep every value they have; the new columns
-- start NULL. No existing row is rewritten.

-- Campaign detail: objectives and at most one related project, production or artist.
ALTER TABLE "campaigns" ADD COLUMN "objectives" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "project_id" UUID;
ALTER TABLE "campaigns" ADD COLUMN "production_id" UUID;
ALTER TABLE "campaigns" ADD COLUMN "talent_id" UUID;

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_objectives_not_blank"
    CHECK ("objectives" IS NULL OR btrim("objectives") <> '');

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_one_related_link"
    CHECK (
        (CASE WHEN "project_id" IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN "production_id" IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN "talent_id" IS NULL THEN 0 ELSE 1 END) <= 1
    );

ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_production_id_fkey"
    FOREIGN KEY ("production_id") REFERENCES "productions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_talent_id_fkey"
    FOREIGN KEY ("talent_id") REFERENCES "talents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "campaigns_project_id_idx" ON "campaigns"("project_id");
CREATE INDEX "campaigns_production_id_idx" ON "campaigns"("production_id");
CREATE INDEX "campaigns_talent_id_idx" ON "campaigns"("talent_id");

-- Append-only history shared by the updates log and metrics. Rows are never
-- updated. Removal happens only by the campaign foreign key cascade.
CREATE FUNCTION "campaign_history_append_only"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'campaign history rows are append-only (% on %)', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$;

-- Updates log.
CREATE TABLE "campaign_updates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "campaign_id" UUID NOT NULL,
    "author_id" UUID,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_updates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_updates_note_not_blank" CHECK (btrim("note") <> '')
);
CREATE INDEX "campaign_updates_campaign_id_created_at_idx" ON "campaign_updates"("campaign_id", "created_at");
ALTER TABLE "campaign_updates"
    ADD CONSTRAINT "campaign_updates_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_updates"
    ADD CONSTRAINT "campaign_updates_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TRIGGER "campaign_updates_append_only" BEFORE UPDATE ON "campaign_updates"
    FOR EACH ROW EXECUTE FUNCTION "campaign_history_append_only"();

-- Recorded metrics.
CREATE TYPE "campaign_metric_key" AS ENUM ('REACH', 'ENGAGEMENT', 'TICKETS_SOLD', 'ATTENDANCE', 'OTHER');

CREATE TABLE "campaign_metrics" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "campaign_id" UUID NOT NULL,
    "key" "campaign_metric_key" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "recorded_on" DATE NOT NULL,
    "source_note" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_metrics_value_non_negative" CHECK ("value" >= 0),
    CONSTRAINT "campaign_metrics_source_note_not_blank" CHECK ("source_note" IS NULL OR btrim("source_note") <> '')
);
CREATE INDEX "campaign_metrics_campaign_id_key_recorded_on_idx" ON "campaign_metrics"("campaign_id", "key", "recorded_on");
ALTER TABLE "campaign_metrics"
    ADD CONSTRAINT "campaign_metrics_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_metrics"
    ADD CONSTRAINT "campaign_metrics_recorded_by_id_fkey"
    FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TRIGGER "campaign_metrics_append_only" BEFORE UPDATE ON "campaign_metrics"
    FOR EACH ROW EXECUTE FUNCTION "campaign_history_append_only"();
