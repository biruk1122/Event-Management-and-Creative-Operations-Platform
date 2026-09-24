-- Promotion activities extend, rather than duplicate, shared campaign work.
CREATE TYPE "promotion_channel" AS ENUM (
    'CONTENT_CREATION',
    'SOCIAL_MEDIA',
    'INFLUENCER_MARKETING',
    'RADIO_PROMOTION',
    'TELEVISION',
    'SCREENS_DIGITAL_MEDIA',
    'ADVERTISING'
);

-- PostgreSQL requires a unique target for each composite integrity link.
CREATE UNIQUE INDEX "campaigns_id_campaign_type_key" ON "campaigns"("id", "campaign_type");
CREATE UNIQUE INDEX "campaign_activities_id_campaign_id_key" ON "campaign_activities"("id", "campaign_id");

CREATE TABLE "promotion_activities" (
    "campaign_activity_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "campaign_type" "campaign_type" NOT NULL DEFAULT 'PROMOTION',
    "channel" "promotion_channel" NOT NULL,

    CONSTRAINT "promotion_activities_pkey" PRIMARY KEY ("campaign_activity_id"),
    CONSTRAINT "promotion_activities_promotion_type_check" CHECK ("campaign_type" = 'PROMOTION')
);

CREATE TABLE "promotion_activity_talents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "campaign_activity_id" UUID NOT NULL,
    "talent_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_activity_talents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promotion_activity_talents_role_not_blank" CHECK (btrim("role") <> '')
);

CREATE UNIQUE INDEX "promotion_activities_campaign_activity_id_campaign_id_key" ON "promotion_activities"("campaign_activity_id", "campaign_id");
CREATE INDEX "promotion_activities_campaign_id_channel_idx" ON "promotion_activities"("campaign_id", "channel");
CREATE UNIQUE INDEX "promotion_activity_talents_campaign_activity_id_talent_id_key" ON "promotion_activity_talents"("campaign_activity_id", "talent_id");
CREATE INDEX "promotion_activity_talents_talent_id_idx" ON "promotion_activity_talents"("talent_id");

ALTER TABLE "promotion_activities" ADD CONSTRAINT "promotion_activities_campaign_activity_id_campaign_id_fkey"
    FOREIGN KEY ("campaign_activity_id", "campaign_id") REFERENCES "campaign_activities"("id", "campaign_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_activities" ADD CONSTRAINT "promotion_activities_campaign_id_campaign_type_fkey"
    FOREIGN KEY ("campaign_id", "campaign_type") REFERENCES "campaigns"("id", "campaign_type") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_activity_talents" ADD CONSTRAINT "promotion_activity_talents_campaign_activity_id_fkey"
    FOREIGN KEY ("campaign_activity_id") REFERENCES "promotion_activities"("campaign_activity_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_activity_talents" ADD CONSTRAINT "promotion_activity_talents_talent_id_fkey"
    FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
