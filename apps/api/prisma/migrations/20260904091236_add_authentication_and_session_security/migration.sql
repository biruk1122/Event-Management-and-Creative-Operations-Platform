-- CreateEnum
CREATE TYPE "user_account_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "session_revocation_reason" AS ENUM ('LOGOUT', 'ROTATED', 'REUSE_DETECTED', 'EXPIRED', 'ADMIN_REVOKED', 'PASSWORD_CHANGED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" TEXT NOT NULL,
    "status" "user_account_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credentials" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failed_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "rotated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" "session_revocation_reason",
    "replaced_by_session_id" UUID,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_credentials_user_id_key" ON "user_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_replaced_by_session_id_key" ON "auth_sessions"("replaced_by_session_id");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_family_id_idx" ON "auth_sessions"("family_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_replaced_by_session_id_fkey" FOREIGN KEY ("replaced_by_session_id") REFERENCES "auth_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- State invariants not expressible in the Prisma schema. Kept in sync with
-- prisma/schema.prisma by hand; `prisma migrate dev` will report these as drift.

-- A lockout counter is never negative.
ALTER TABLE "user_credentials"
    ADD CONSTRAINT "user_credentials_failed_attempt_count_non_negative"
    CHECK ("failed_attempt_count" >= 0);

-- A session always expires after it was issued.
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_expiry_after_issue"
    CHECK ("expires_at" > "issued_at");

-- A revocation reason is present exactly when the session is revoked.
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_revoked_reason_requires_revoked_at"
    CHECK (("revoked_reason" IS NULL) = ("revoked_at" IS NULL));

-- Rotating a session revokes it (with reason ROTATED).
ALTER TABLE "auth_sessions"
    ADD CONSTRAINT "auth_sessions_rotated_implies_revoked"
    CHECK ("rotated_at" IS NULL OR "revoked_at" IS NOT NULL);
