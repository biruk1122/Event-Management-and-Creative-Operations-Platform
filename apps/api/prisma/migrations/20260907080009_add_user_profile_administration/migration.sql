-- AlterTable
ALTER TABLE "user_credentials" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivated_at" TIMESTAMPTZ(6),
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "profile_image" TEXT;

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_last_name_first_name_idx" ON "users"("last_name", "first_name");

-- A present profile string is real text, never blank or whitespace-only.
-- NULL means "not provided" and stays allowed.
ALTER TABLE "users"
    ADD CONSTRAINT "users_first_name_not_blank"
    CHECK ("first_name" IS NULL OR btrim("first_name") <> '');

ALTER TABLE "users"
    ADD CONSTRAINT "users_last_name_not_blank"
    CHECK ("last_name" IS NULL OR btrim("last_name") <> '');

ALTER TABLE "users"
    ADD CONSTRAINT "users_phone_not_blank"
    CHECK ("phone" IS NULL OR btrim("phone") <> '');

ALTER TABLE "users"
    ADD CONSTRAINT "users_profile_image_not_blank"
    CHECK ("profile_image" IS NULL OR btrim("profile_image") <> '');

-- `deactivated_at` is set exactly when the account is INACTIVE, so the
-- deactivation time can never drift from the status it records.
ALTER TABLE "users"
    ADD CONSTRAINT "users_deactivated_at_matches_status"
    CHECK (("deactivated_at" IS NULL) = ("status" = 'ACTIVE'));
