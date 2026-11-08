-- EVE-229: APPROVED and PAUSED belong to promotion campaigns only. Marketing
-- campaigns keep PLANNED -> ACTIVE -> COMPLETED | CANCELLED. No existing row
-- can hold either value yet, so the constraint validates immediately.
ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_promotion_only_statuses"
    CHECK (
        "campaign_type" = 'PROMOTION'
        OR "status" NOT IN ('APPROVED', 'PAUSED')
    );
