-- Centralized SMS (Phase 1): message records, provider attempts, idempotency.
-- Additive only. No existing table is altered.

CREATE TYPE "sms_category" AS ENUM ('TEST');

CREATE TYPE "sms_message_status" AS ENUM (
    'PENDING',
    'SENDING',
    'ACCEPTED',
    'DELIVERED',
    'FAILED',
    'UNCERTAIN',
    'CANCELLED',
    'SKIPPED'
);

CREATE TABLE "sms_messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "idempotency_key" TEXT NOT NULL,
    "category" "sms_category" NOT NULL,
    "recipient_user_id" UUID,
    "recipient_phone" TEXT,
    "body" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "status" "sms_message_status" NOT NULL DEFAULT 'PENDING',
    "skip_reason" TEXT,
    "provider_message_id" TEXT,
    "provider_status" TEXT,
    "provider_status_checked_at" TIMESTAMPTZ(6),
    "callback_status" TEXT,
    "callback_received_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id"),
    -- A skipped message must say why it was skipped.
    CONSTRAINT "sms_messages_skip_reason_check" CHECK ("status" <> 'SKIPPED' OR "skip_reason" IS NOT NULL),
    -- Anything the provider accepted must carry its message id.
    CONSTRAINT "sms_messages_accepted_check" CHECK ("status" NOT IN ('ACCEPTED', 'DELIVERED') OR "provider_message_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "sms_messages_idempotency_key_key" ON "sms_messages"("idempotency_key");
CREATE UNIQUE INDEX "sms_messages_provider_message_id_key" ON "sms_messages"("provider_message_id");
CREATE INDEX "sms_messages_status_created_at_idx" ON "sms_messages"("status", "created_at");
CREATE INDEX "sms_messages_recipient_user_id_created_at_idx" ON "sms_messages"("recipient_user_id", "created_at");
CREATE INDEX "sms_messages_category_created_at_idx" ON "sms_messages"("category", "created_at");

ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_recipient_user_id_fkey"
    FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sms_delivery_attempts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "sms_message_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "provider_http_status" INTEGER,
    "provider_response" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "sms_delivery_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sms_delivery_attempts_outcome_check" CHECK ("outcome" IN ('ACCEPTED', 'REJECTED', 'UNCERTAIN'))
);

CREATE UNIQUE INDEX "sms_delivery_attempts_sms_message_id_attempt_number_key"
    ON "sms_delivery_attempts"("sms_message_id", "attempt_number");

ALTER TABLE "sms_delivery_attempts" ADD CONSTRAINT "sms_delivery_attempts_sms_message_id_fkey"
    FOREIGN KEY ("sms_message_id") REFERENCES "sms_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
