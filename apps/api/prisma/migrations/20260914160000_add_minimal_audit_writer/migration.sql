-- EVE-94 requires durable evidence for its approval-sensitive actions. This
-- is the minimal append-only writer substrate; REL-02 retains ownership of
-- authorized search/export, retention, and storage-level tamper controls.

CREATE TYPE "audit_actor_kind" AS ENUM ('USER', 'SYSTEM', 'ANONYMOUS');
CREATE TYPE "audit_outcome" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED');

CREATE TABLE "audit_records" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_kind" "audit_actor_kind" NOT NULL,
    "actor_user_id" UUID,
    "request_id" TEXT,
    "correlation_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "workspace_context" UUID,
    "outcome" "audit_outcome" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_records_actor_check" CHECK (
        ("actor_kind" = 'USER' AND "actor_user_id" IS NOT NULL)
        OR ("actor_kind" <> 'USER' AND "actor_user_id" IS NULL)
    ),
    CONSTRAINT "audit_records_context_check" CHECK (
        "request_id" IS NOT NULL OR "correlation_id" IS NOT NULL
    ),
    CONSTRAINT "audit_records_metadata_object_check" CHECK (
        jsonb_typeof("metadata") = 'object'
    )
);

CREATE INDEX "audit_records_occurred_at_id_idx"
    ON "audit_records"("occurred_at", "id");
CREATE INDEX "audit_records_action_occurred_at_idx"
    ON "audit_records"("action", "occurred_at");
CREATE INDEX "audit_records_actor_user_id_occurred_at_idx"
    ON "audit_records"("actor_user_id", "occurred_at");
CREATE INDEX "audit_records_resource_lookup_idx"
    ON "audit_records"("resource_type", "resource_id", "occurred_at");
CREATE INDEX "audit_records_workspace_context_occurred_at_idx"
    ON "audit_records"("workspace_context", "occurred_at");
