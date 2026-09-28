-- Marketing strategy is one-to-one content of a shared MARKETING campaign.
-- Shared money, lifecycle, activity and workspace data stay on the campaign.
CREATE TABLE "marketing_campaigns" (
    "campaign_id" UUID NOT NULL,
    "campaign_type" "campaign_type" NOT NULL DEFAULT 'MARKETING',
    "strategy" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("campaign_id"),
    CONSTRAINT "marketing_campaigns_type_check" CHECK ("campaign_type" = 'MARKETING'),
    CONSTRAINT "marketing_campaigns_strategy_not_blank" CHECK (btrim("strategy") <> '')
);

CREATE UNIQUE INDEX "marketing_campaigns_campaign_id_campaign_type_key" ON "marketing_campaigns"("campaign_id", "campaign_type");

ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_campaign_id_campaign_type_fkey"
    FOREIGN KEY ("campaign_id", "campaign_type") REFERENCES "campaigns"("id", "campaign_type") ON DELETE CASCADE ON UPDATE CASCADE;
