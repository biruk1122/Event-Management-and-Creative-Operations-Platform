-- EVE-233: partnerships on partner records, campaign expenses (optionally on
-- one of the campaign's activities) and partnership documents.
--
-- Additive only. Existing partners and expenses keep every value they have;
-- the new columns start NULL. Three existing constraints are widened and keep
-- every term they have today.

-- CreateEnum
CREATE TYPE "partnership_type" AS ENUM ('BRAND', 'SPONSOR', 'INFLUENCER', 'MEDIA', 'ADVERTISING_AGENCY', 'PROMOTIONAL_PARTNER', 'OTHER');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "campaign_activity_id" UUID,
ADD COLUMN     "expense_date" DATE,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updated_by_id" UUID;

-- AlterTable
ALTER TABLE "managed_files" ADD COLUMN     "intent_partner_id" UUID;

-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "agreed_value_amount" DECIMAL(14,2),
ADD COLUMN     "agreed_value_currency" CHAR(3),
ADD COLUMN     "agreement_details" TEXT,
ADD COLUMN     "agreement_end_on" DATE,
ADD COLUMN     "agreement_start_on" DATE,
ADD COLUMN     "partnership_name" TEXT,
ADD COLUMN     "partnership_type" "partnership_type",
ADD COLUMN     "updated_by_id" UUID;

-- CreateTable
CREATE TABLE "partner_attachments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "partner_id" UUID NOT NULL,
    "managed_file_id" UUID NOT NULL,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_attachments_managed_file_id_idx" ON "partner_attachments"("managed_file_id");

-- CreateIndex
CREATE INDEX "partner_attachments_attached_by_id_idx" ON "partner_attachments"("attached_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_attachments_partner_id_managed_file_id_key" ON "partner_attachments"("partner_id", "managed_file_id");

-- CreateIndex
CREATE INDEX "expenses_campaign_activity_id_idx" ON "expenses"("campaign_activity_id");

-- CreateIndex
CREATE INDEX "managed_files_intent_partner_id_idx" ON "managed_files"("intent_partner_id");

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_partner_id_fkey" FOREIGN KEY ("intent_partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_campaign_activity_id_campaign_id_fkey" FOREIGN KEY ("campaign_activity_id", "campaign_id") REFERENCES "campaign_activities"("id", "campaign_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_attachments" ADD CONSTRAINT "partner_attachments_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_attachments" ADD CONSTRAINT "partner_attachments_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_attachments" ADD CONSTRAINT "partner_attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partnerships: agreements run forwards, values are non-negative and always
-- carry a currency, and text fields are never blank.
ALTER TABLE "partners"
    ADD CONSTRAINT "partners_agreement_dates_ordered"
    CHECK ("agreement_start_on" IS NULL OR "agreement_end_on" IS NULL OR "agreement_end_on" >= "agreement_start_on");
ALTER TABLE "partners"
    ADD CONSTRAINT "partners_agreed_value_non_negative"
    CHECK ("agreed_value_amount" IS NULL OR "agreed_value_amount" >= 0);
ALTER TABLE "partners"
    ADD CONSTRAINT "partners_agreed_value_and_currency"
    CHECK (("agreed_value_amount" IS NULL) = ("agreed_value_currency" IS NULL));
ALTER TABLE "partners"
    ADD CONSTRAINT "partners_partnership_name_not_blank"
    CHECK ("partnership_name" IS NULL OR btrim("partnership_name") <> '');
ALTER TABLE "partners"
    ADD CONSTRAINT "partners_agreement_details_not_blank"
    CHECK ("agreement_details" IS NULL OR btrim("agreement_details") <> '');

-- Expenses: an expense may now belong to a campaign alone. The composite
-- foreign key above keeps an activity on its own campaign; this CHECK stops an
-- activity being set without a campaign, which a composite key would let pass.
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_has_owner";
ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_has_owner"
    CHECK ("event_id" IS NOT NULL OR "production_id" IS NOT NULL OR "campaign_id" IS NOT NULL);
ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_activity_needs_campaign"
    CHECK ("campaign_activity_id" IS NULL OR "campaign_id" IS NOT NULL);
ALTER TABLE "expenses"
    ADD CONSTRAINT "expenses_title_not_blank"
    CHECK ("title" IS NULL OR btrim("title") <> '');

-- At most one intent parent: the same terms as
-- 20261109120000_creative_requests, plus intent_partner_id.
ALTER TABLE "managed_files"
    DROP CONSTRAINT "managed_files_intent_parent_exclusive";

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_intent_parent_exclusive"
    CHECK (
        (CASE WHEN "intent_workspace_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_task_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_conversation_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_talent_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_expense_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_report_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_letter_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_document_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_leave_request_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_creative_request_id" IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN "intent_partner_id" IS NOT NULL THEN 1 ELSE 0 END)
        <= 1
    );

-- An available file needs an explicit attachment. Same function as
-- 20261109120000_creative_requests, with partner_attachments recognized.
CREATE OR REPLACE FUNCTION "managed_files_available_require_attachment"()
RETURNS TRIGGER AS $$
DECLARE
    affected_file_id UUID;
    previous_file_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'managed_files' AND TG_OP = 'DELETE' THEN
        affected_file_id := OLD."id";
    ELSIF TG_TABLE_NAME = 'managed_files' THEN
        affected_file_id := NEW."id";
    ELSIF TG_TABLE_NAME = 'talents' AND TG_OP = 'DELETE' THEN
        affected_file_id := OLD."profile_image_id";
    ELSIF TG_TABLE_NAME = 'talents' THEN
        affected_file_id := NEW."profile_image_id";
        IF TG_OP = 'UPDATE' THEN
            previous_file_id := OLD."profile_image_id";
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        affected_file_id := OLD."managed_file_id";
    ELSE
        affected_file_id := NEW."managed_file_id";
        IF TG_OP = 'UPDATE' THEN
            previous_file_id := OLD."managed_file_id";
        END IF;
    END IF;

    PERFORM 1 FROM "managed_files"
    WHERE "id" IN (affected_file_id, previous_file_id)
    ORDER BY "id" FOR UPDATE;

    IF EXISTS (
        SELECT 1 FROM "managed_files" AS "managed_file"
        WHERE "managed_file"."id" IN (affected_file_id, previous_file_id)
          AND "managed_file"."state" = 'AVAILABLE'
          AND NOT EXISTS (SELECT 1 FROM "workspace_file_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "task_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "message_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "talents" WHERE "profile_image_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "expense_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "report_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "letter_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "documents" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "creative_request_attachments" WHERE "managed_file_id" = "managed_file"."id")
          AND NOT EXISTS (SELECT 1 FROM "partner_attachments" WHERE "managed_file_id" = "managed_file"."id")
    ) THEN
        RAISE EXCEPTION 'available managed files require an explicit attachment'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'managed_files_available_require_attachment';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_partner_attachment_change"
    AFTER INSERT OR UPDATE OR DELETE ON "partner_attachments"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();
