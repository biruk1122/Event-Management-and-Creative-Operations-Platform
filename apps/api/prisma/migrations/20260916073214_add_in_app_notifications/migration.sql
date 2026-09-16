-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE', 'TASK_OVERDUE', 'TASK_APPROVED', 'TASK_REJECTED', 'NEW_MESSAGE', 'MESSAGE_MENTION', 'MEETING_INVITATION', 'MEETING_REMINDER', 'EVENT_REMINDER', 'TODO_REMINDER', 'REPORT_REMINDER');

-- CreateEnum
CREATE TYPE "outbox_actor_kind" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "outbox_delivery_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "actor_kind" "outbox_actor_kind" NOT NULL,
    "actor_user_id" UUID,
    "correlation_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID,
    "workspace_context" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_deliveries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_id" UUID NOT NULL,
    "consumer_name" TEXT NOT NULL,
    "consumer_version" INTEGER NOT NULL,
    "status" "outbox_delivery_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "succeeded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "recipient_user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "source_event_id" UUID NOT NULL,
    "occurrence_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "task_id" UUID,
    "message_id" UUID,
    "event_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "muted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateIndex
CREATE INDEX "outbox_events_name_occurred_at_idx" ON "outbox_events"("name", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_resource_type_resource_id_idx" ON "outbox_events"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "outbox_deliveries_status_next_attempt_at_created_at_idx" ON "outbox_deliveries"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_deliveries_event_id_consumer_name_consumer_version_key" ON "outbox_deliveries"("event_id", "consumer_name", "consumer_version");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_created_at_id_idx" ON "notifications"("recipient_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_read_at_idx" ON "notifications"("recipient_user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_user_id_type_occurrence_key_key" ON "notifications"("recipient_user_id", "type", "occurrence_key");

-- AddForeignKey
ALTER TABLE "outbox_deliveries" ADD CONSTRAINT "outbox_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints, so they are added here by hand,
-- matching teams_name_not_blank and events_budget_amount_and_currency from
-- earlier migrations.

-- ADR 0003 section 1's typed target union: at most one of the three target
-- domains that exist today may be set. A MEETING_*/TODO_REMINDER/
-- REPORT_REMINDER notification has none set, since those domains do not
-- exist yet - see the model comment on `Notification` in schema.prisma.
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_target_at_most_one"
    CHECK (
        (CASE WHEN "task_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "message_id" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "event_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );

-- A notification cannot be read before it was created.
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_read_at_after_created_at"
    CHECK ("read_at" IS NULL OR "read_at" >= "created_at");

-- ADR 0003 section 4: only these seven of the twelve NotificationType values
-- represent a schedulable reminder or an ordinary activity update a user may
-- silence. Assignment, review-outcome, mention, and meeting-invitation
-- notifications represent a direct action, outcome, or participation
-- obligation and can never be muted.
ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_type_mutable"
    CHECK (
        "type" IN (
            'TASK_DUE', 'TASK_OVERDUE', 'NEW_MESSAGE', 'MEETING_REMINDER',
            'EVENT_REMINDER', 'TODO_REMINDER', 'REPORT_REMINDER'
        )
    );

-- ADR 0001 section 1/2: version starts at 1 and increments only on a
-- breaking payload change.
ALTER TABLE "outbox_events"
    ADD CONSTRAINT "outbox_events_version_positive"
    CHECK ("version" >= 1);

-- ADR 0001 section 4: a delivery's attempt counter and its consumer's
-- version are never negative or zero respectively.
ALTER TABLE "outbox_deliveries"
    ADD CONSTRAINT "outbox_deliveries_consumer_version_positive"
    CHECK ("consumer_version" >= 1);

ALTER TABLE "outbox_deliveries"
    ADD CONSTRAINT "outbox_deliveries_attempts_not_negative"
    CHECK ("attempts" >= 0);

-- succeeded_at is set exactly when status is SUCCEEDED - never independently
-- of it.
ALTER TABLE "outbox_deliveries"
    ADD CONSTRAINT "outbox_deliveries_succeeded_at_matches_status"
    CHECK (("status" = 'SUCCEEDED') = ("succeeded_at" IS NOT NULL));
