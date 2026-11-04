-- PostgreSQL truncates identifiers to 63 bytes. The promotion active-slot key
-- created by 20261103120000 exceeds that, so the database stored it under the
-- truncated name below. Rename it to the name Prisma derives from the schema so
-- `prisma migrate diff` reports no drift. The index itself is unchanged.

-- RenameIndex
ALTER INDEX "promotion_activity_talents_campaign_activity_id_talent_id_activ" RENAME TO "promotion_activity_talents_campaign_activity_id_talent_id_a_key";
