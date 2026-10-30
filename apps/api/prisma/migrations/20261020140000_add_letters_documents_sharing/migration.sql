-- CreateEnum
CREATE TYPE "letter_direction" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "letter_category" AS ENUM ('CAST', 'PROD', 'MKT', 'PROMO', 'EOM', 'HR', 'OTHER');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('LETTER', 'REPORT', 'PRICE_QUOTATION', 'CONTRACT', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "share_scope" AS ENUM ('VIEW', 'VIEW_AND_DOWNLOAD');

-- AlterTable
ALTER TABLE "managed_files" ADD COLUMN     "intent_document_id" UUID,
ADD COLUMN     "intent_letter_id" UUID;

-- CreateTable
CREATE TABLE "letters" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reference_number" TEXT NOT NULL,
    "direction" "letter_direction" NOT NULL,
    "category" "letter_category" NOT NULL,
    "date" DATE NOT NULL,
    "project_id" UUID,
    "subject" TEXT NOT NULL,
    "from_party" TEXT,
    "to_party" TEXT,
    "sender_reference_number" TEXT,
    "short_description" TEXT,
    "remark" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_reference_counters" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "category" "letter_category" NOT NULL,
    "year" INTEGER NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_reference_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_attachments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "letter_id" UUID NOT NULL,
    "managed_file_id" UUID NOT NULL,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_remarks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "letter_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "display_name" TEXT NOT NULL,
    "document_type" "document_type" NOT NULL,
    "managed_file_id" UUID,
    "project_id" UUID,
    "source_letter_id" UUID,
    "description" TEXT,
    "uploaded_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "letter_id" UUID,
    "document_id" UUID,
    "recipient_id" UUID,
    "all_employees" BOOLEAN NOT NULL DEFAULT false,
    "scope" "share_scope" NOT NULL DEFAULT 'VIEW',
    "shared_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_id" UUID,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "letters_reference_number_key" ON "letters"("reference_number");

-- CreateIndex
CREATE INDEX "letters_direction_date_idx" ON "letters"("direction", "date");

-- CreateIndex
CREATE INDEX "letters_category_idx" ON "letters"("category");

-- CreateIndex
CREATE INDEX "letters_project_id_idx" ON "letters"("project_id");

-- CreateIndex
CREATE INDEX "letters_deleted_at_idx" ON "letters"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "letter_reference_counters_category_year_key" ON "letter_reference_counters"("category", "year");

-- CreateIndex
CREATE INDEX "letter_attachments_managed_file_id_idx" ON "letter_attachments"("managed_file_id");

-- CreateIndex
CREATE INDEX "letter_attachments_attached_by_id_idx" ON "letter_attachments"("attached_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "letter_attachments_letter_id_managed_file_id_key" ON "letter_attachments"("letter_id", "managed_file_id");

-- CreateIndex
CREATE INDEX "letter_remarks_letter_id_created_at_idx" ON "letter_remarks"("letter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "documents_managed_file_id_key" ON "documents"("managed_file_id");

-- CreateIndex
CREATE INDEX "documents_document_type_idx" ON "documents"("document_type");

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- CreateIndex
CREATE INDEX "documents_source_letter_id_idx" ON "documents"("source_letter_id");

-- CreateIndex
CREATE INDEX "documents_uploaded_by_id_idx" ON "documents"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "documents_deleted_at_idx" ON "documents"("deleted_at");

-- CreateIndex
CREATE INDEX "shares_letter_id_idx" ON "shares"("letter_id");

-- CreateIndex
CREATE INDEX "shares_document_id_idx" ON "shares"("document_id");

-- CreateIndex
CREATE INDEX "shares_recipient_id_idx" ON "shares"("recipient_id");

-- CreateIndex
CREATE INDEX "managed_files_intent_letter_id_idx" ON "managed_files"("intent_letter_id");

-- CreateIndex
CREATE INDEX "managed_files_intent_document_id_idx" ON "managed_files"("intent_document_id");

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_letter_id_fkey" FOREIGN KEY ("intent_letter_id") REFERENCES "letters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_document_id_fkey" FOREIGN KEY ("intent_document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_attachments" ADD CONSTRAINT "letter_attachments_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_attachments" ADD CONSTRAINT "letter_attachments_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_attachments" ADD CONSTRAINT "letter_attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_remarks" ADD CONSTRAINT "letter_remarks_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_remarks" ADD CONSTRAINT "letter_remarks_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_letter_id_fkey" FOREIGN KEY ("source_letter_id") REFERENCES "letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_letter_id_fkey" FOREIGN KEY ("letter_id") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_shared_by_id_fkey" FOREIGN KEY ("shared_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: letters - non-blank text fields.
ALTER TABLE "letters" ADD CONSTRAINT "letters_reference_number_not_blank"
    CHECK (btrim("reference_number") <> '');

ALTER TABLE "letters" ADD CONSTRAINT "letters_subject_not_blank"
    CHECK (btrim("subject") <> '');

-- CheckConstraint: letters - direction pairs with exactly the matching party
-- field (From for Incoming, To for Outgoing), never both, never neither.
ALTER TABLE "letters" ADD CONSTRAINT "letters_direction_party"
    CHECK (
        (
            "direction" = 'INCOMING'
            AND "from_party" IS NOT NULL AND btrim("from_party") <> ''
            AND "to_party" IS NULL
        )
        OR (
            "direction" = 'OUTGOING'
            AND "to_party" IS NOT NULL AND btrim("to_party") <> ''
            AND "from_party" IS NULL
        )
    );

-- CheckConstraint: letters - the sender's own reference number only makes
-- sense on a received (Incoming) letter.
ALTER TABLE "letters" ADD CONSTRAINT "letters_sender_reference_incoming_only"
    CHECK ("sender_reference_number" IS NULL OR "direction" = 'INCOMING');

-- CheckConstraint: letter_remarks - never a blank remark.
ALTER TABLE "letter_remarks" ADD CONSTRAINT "letter_remarks_body_not_blank"
    CHECK (btrim("body") <> '');

-- CheckConstraint: documents - never a blank display name.
ALTER TABLE "documents" ADD CONSTRAINT "documents_display_name_not_blank"
    CHECK (btrim("display_name") <> '');

-- CheckConstraint: shares - exactly one target (a share is always for
-- exactly one letter or exactly one document, never both, never neither).
ALTER TABLE "shares" ADD CONSTRAINT "shares_exactly_one_target"
    CHECK (
        ("letter_id" IS NOT NULL AND "document_id" IS NULL)
        OR ("letter_id" IS NULL AND "document_id" IS NOT NULL)
    );

-- CheckConstraint: shares - exactly one audience (a direct recipient, xor
-- the all-employees audience - never both, never neither).
ALTER TABLE "shares" ADD CONSTRAINT "shares_exactly_one_audience"
    CHECK (
        ("recipient_id" IS NOT NULL AND "all_employees" = false)
        OR ("recipient_id" IS NULL AND "all_employees" = true)
    );

-- CheckConstraint: shares - a recorded revoking actor always carries a
-- revocation timestamp (a timestamp alone, with no actor, is allowed for a
-- system/automated revocation).
ALTER TABLE "shares" ADD CONSTRAINT "shares_revoked_actor"
    CHECK ("revoked_by_id" IS NULL OR "revoked_at" IS NOT NULL);

-- Partial unique indexes: at most one *active* share per target+audience.
-- Revoking a share (setting revoked_at) frees the slot for a fresh one,
-- while preserving the revoked row as history. Postgres enforces these
-- atomically, so a concurrent duplicate-share race is a real unique
-- violation (23505), never a logic race.
CREATE UNIQUE INDEX "shares_letter_recipient_active" ON "shares" ("letter_id", "recipient_id")
    WHERE "revoked_at" IS NULL AND "letter_id" IS NOT NULL AND "recipient_id" IS NOT NULL;

CREATE UNIQUE INDEX "shares_letter_all_employees_active" ON "shares" ("letter_id")
    WHERE "revoked_at" IS NULL AND "letter_id" IS NOT NULL AND "all_employees" = true;

CREATE UNIQUE INDEX "shares_document_recipient_active" ON "shares" ("document_id", "recipient_id")
    WHERE "revoked_at" IS NULL AND "document_id" IS NOT NULL AND "recipient_id" IS NOT NULL;

CREATE UNIQUE INDEX "shares_document_all_employees_active" ON "shares" ("document_id")
    WHERE "revoked_at" IS NULL AND "document_id" IS NOT NULL AND "all_employees" = true;
