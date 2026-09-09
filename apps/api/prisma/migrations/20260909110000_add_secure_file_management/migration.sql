-- CreateEnum
CREATE TYPE "managed_file_state" AS ENUM ('PENDING', 'AVAILABLE', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "managed_files" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "declared_media_type" TEXT NOT NULL,
    "declared_size_bytes" INTEGER NOT NULL,
    "verified_media_type" TEXT,
    "verified_size_bytes" INTEGER,
    "state" "managed_file_state" NOT NULL DEFAULT 'PENDING',
    "intent_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6),
    "available_at" TIMESTAMPTZ(6),
    "unavailable_at" TIMESTAMPTZ(6),
    "cleanup_after" TIMESTAMPTZ(6),
    "initiated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "managed_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_file_attachments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID NOT NULL,
    "managed_file_id" UUID NOT NULL,
    "attached_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "managed_files_storage_key_key" ON "managed_files"("storage_key");

-- CreateIndex
CREATE INDEX "managed_files_state_intent_expires_at_idx" ON "managed_files"("state", "intent_expires_at");

-- CreateIndex
CREATE INDEX "managed_files_state_cleanup_after_idx" ON "managed_files"("state", "cleanup_after");

-- CreateIndex
CREATE INDEX "managed_files_initiated_by_id_idx" ON "managed_files"("initiated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_file_attachments_workspace_id_managed_file_id_key" ON "workspace_file_attachments"("workspace_id", "managed_file_id");

-- CreateIndex
CREATE INDEX "workspace_file_attachments_managed_file_id_idx" ON "workspace_file_attachments"("managed_file_id");

-- CreateIndex
CREATE INDEX "workspace_file_attachments_attached_by_id_idx" ON "workspace_file_attachments"("attached_by_id");

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_file_attachments" ADD CONSTRAINT "workspace_file_attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_file_attachments" ADD CONSTRAINT "workspace_file_attachments_managed_file_id_fkey" FOREIGN KEY ("managed_file_id") REFERENCES "managed_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_file_attachments" ADD CONSTRAINT "workspace_file_attachments_attached_by_id_fkey" FOREIGN KEY ("attached_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgreSQL enforces the integrity rules Prisma cannot express. The opaque
-- storage key is an internal S3-compatible object reference, never a browser
-- URL, so it must be meaningful but has no filename-derived structure.
ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_storage_key_not_blank"
    CHECK (btrim("storage_key") <> '');

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_original_filename_not_blank"
    CHECK (btrim("original_filename") <> '' AND octet_length("original_filename") <= 255);

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_declared_media_type_not_blank"
    CHECK (btrim("declared_media_type") <> '');

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_verified_media_type_not_blank"
    CHECK ("verified_media_type" IS NULL OR btrim("verified_media_type") <> '');

-- The initial FIL policy permits objects from 1 byte through 10 MiB. Declared
-- and verified byte counts use the same bounded unit so verification cannot
-- make an accepted object exceed the policy.
ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_declared_size_bytes_in_range"
    CHECK ("declared_size_bytes" BETWEEN 1 AND 10485760);

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_verified_size_bytes_in_range"
    CHECK ("verified_size_bytes" IS NULL OR "verified_size_bytes" BETWEEN 1 AND 10485760);

-- Object verification is atomic metadata: a MIME type and byte count are
-- either both recorded or both absent.
ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_verification_metadata_complete"
    CHECK (("verified_media_type" IS NULL) = ("verified_size_bytes" IS NULL));

-- An upload intent cannot already be expired at creation time. It may remain
-- as historical evidence after upload/finalization, which is why this applies
-- to every storage lifecycle state.
ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_intent_expiry_after_created"
    CHECK ("intent_expires_at" > "created_at");

-- State-specific timestamps and metadata encode the retention lifecycle. An
-- unavailable file can be a never-uploaded expired/rejected intent (without
-- verified metadata) or a detached/missing verified object. `cleanup_after`
-- is deliberately required only once it is unavailable.
ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_state_lifecycle_consistent"
    CHECK (
        (
            "state" = 'PENDING'
            AND "available_at" IS NULL
            AND "unavailable_at" IS NULL
            AND "cleanup_after" IS NULL
            AND "verified_media_type" IS NULL
            AND "verified_size_bytes" IS NULL
        )
        OR (
            "state" = 'AVAILABLE'
            AND "uploaded_at" IS NOT NULL
            AND "available_at" IS NOT NULL
            AND "unavailable_at" IS NULL
            AND "cleanup_after" IS NULL
            AND "verified_media_type" IS NOT NULL
            AND "verified_size_bytes" IS NOT NULL
        )
        OR (
            "state" = 'UNAVAILABLE'
            AND "unavailable_at" IS NOT NULL
            AND "cleanup_after" IS NOT NULL
        )
    );

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_cleanup_after_unavailable"
    CHECK (
        "cleanup_after" IS NULL
        OR "unavailable_at" IS NULL
        OR "cleanup_after" > "unavailable_at"
    );

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_available_after_upload"
    CHECK (
        "available_at" IS NULL
        OR "uploaded_at" IS NULL
        OR "available_at" >= "uploaded_at"
    );

-- An attachment may point only at an uploaded, verified, AVAILABLE object.
-- Availability is additionally verified at commit time below, so finalization
-- can create a verified file and its first explicit authorization link
-- atomically.
CREATE FUNCTION "workspace_file_attachments_require_finalized_file"()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "managed_files"
        WHERE "id" = NEW."managed_file_id"
          AND "state" <> 'AVAILABLE'
    ) THEN
        RAISE EXCEPTION 'workspace file attachments require an available managed file'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'workspace_file_attachments_require_finalized_file';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "workspace_file_attachments_require_finalized_file"
    BEFORE INSERT OR UPDATE OF "managed_file_id"
    ON "workspace_file_attachments"
    FOR EACH ROW
    EXECUTE FUNCTION "workspace_file_attachments_require_finalized_file"();

-- A file advertised as AVAILABLE must still have an explicit authorized
-- parent when the transaction commits. The deferred checks allow the eventual
-- finalization/detachment service to update state and association together,
-- without allowing a persisted available orphan.
CREATE FUNCTION "managed_files_available_require_attachment"()
RETURNS TRIGGER AS $$
DECLARE
    affected_file_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'managed_files' AND TG_OP = 'DELETE' THEN
        affected_file_id := OLD."id";
    ELSIF TG_TABLE_NAME = 'managed_files' THEN
        affected_file_id := NEW."id";
    ELSIF TG_OP = 'DELETE' THEN
        affected_file_id := OLD."managed_file_id";
    ELSE
        affected_file_id := NEW."managed_file_id";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "managed_files" AS "managed_file"
        WHERE "managed_file"."id" = affected_file_id
          AND "managed_file"."state" = 'AVAILABLE'
    ) AND NOT EXISTS (
        SELECT 1
        FROM "workspace_file_attachments"
        WHERE "managed_file_id" = affected_file_id
    ) THEN
        RAISE EXCEPTION 'available managed files require an explicit attachment'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'managed_files_available_require_attachment';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_file_change"
    AFTER INSERT OR UPDATE OR DELETE
    ON "managed_files"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();

CREATE CONSTRAINT TRIGGER "managed_files_available_require_attachment_after_attachment_change"
    AFTER INSERT OR UPDATE OR DELETE
    ON "workspace_file_attachments"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION "managed_files_available_require_attachment"();
