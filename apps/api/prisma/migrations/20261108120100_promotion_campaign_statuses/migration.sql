-- EVE-229: two promotion-only campaign statuses.
--
-- Additive: existing rows and both existing lifecycles are unchanged. A new
-- enum value cannot be used in the transaction that adds it, so the rule that
-- keeps these values on promotion campaigns is the next migration.
ALTER TYPE "campaign_status" ADD VALUE IF NOT EXISTS 'APPROVED' AFTER 'PLANNED';
ALTER TYPE "campaign_status" ADD VALUE IF NOT EXISTS 'PAUSED' AFTER 'ACTIVE';
