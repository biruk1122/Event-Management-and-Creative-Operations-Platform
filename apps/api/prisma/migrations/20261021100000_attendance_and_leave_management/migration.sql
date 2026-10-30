-- CreateEnum
CREATE TYPE "attendance_method" AS ENUM ('OFFICE_KIOSK', 'MOBILE_EVENT');

-- CreateEnum
CREATE TYPE "punch_type" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "attendance_session_status" AS ENUM ('OPEN', 'CLOSED', 'MISSING_CHECKOUT');

-- CreateEnum
CREATE TYPE "attendance_verification_result" AS ENUM ('NOT_APPLICABLE', 'VERIFIED', 'OUT_OF_RANGE', 'LOW_ACCURACY', 'LOCATION_UNAVAILABLE', 'EXCEPTION_APPROVED');

-- CreateEnum
CREATE TYPE "event_shift_status" AS ENUM ('PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "event_shift_change_type" AS ENUM ('RESCHEDULE', 'EXTENSION', 'LOCATION_CHANGE', 'CANCELLATION', 'REINSTATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "attendance_overtime_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "attendance_exception_type" AS ENUM ('MISSED_CHECKOUT', 'OUT_OF_RANGE', 'LOCATION_UNAVAILABLE', 'MANUAL_CORRECTION_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "attendance_exception_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "leave_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'RETURNED_FOR_CHANGES', 'AMENDED');

-- CreateEnum
CREATE TYPE "leave_ledger_entry_kind" AS ENUM ('GRANT', 'CONSUMPTION', 'EXPIRY', 'ADJUSTMENT', 'REVERSAL');

-- AlterTable
ALTER TABLE "managed_files" ADD COLUMN     "intent_leave_request_id" UUID;

-- CreateTable
CREATE TABLE "attendance_kiosks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "location_label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_kiosks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_shifts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_id" UUID NOT NULL,
    "label" TEXT,
    "planned_start_at" TIMESTAMPTZ(6) NOT NULL,
    "planned_end_at" TIMESTAMPTZ(6) NOT NULL,
    "time_zone" TEXT NOT NULL,
    "location_label" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "geofence_radius_meters" INTEGER NOT NULL DEFAULT 150,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "event_shift_status" NOT NULL DEFAULT 'PLANNED',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_shift_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_shift_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),
    "unassigned_by_id" UUID,

    CONSTRAINT "event_shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_shift_changes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "event_shift_id" UUID NOT NULL,
    "change_type" "event_shift_change_type" NOT NULL,
    "previous_start_at" TIMESTAMPTZ(6),
    "previous_end_at" TIMESTAMPTZ(6),
    "new_start_at" TIMESTAMPTZ(6),
    "new_end_at" TIMESTAMPTZ(6),
    "reason" TEXT NOT NULL,
    "changed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_shift_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "employee_id" UUID NOT NULL,
    "method" "attendance_method" NOT NULL,
    "punch_type" "punch_type" NOT NULL,
    "kiosk_id" UUID,
    "event_shift_id" UUID,
    "client_request_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "accuracy_meters" DECIMAL(8,2),
    "distance_meters" DECIMAL(10,2),
    "verification_result" "attendance_verification_result" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "employee_id" UUID NOT NULL,
    "method" "attendance_method" NOT NULL,
    "kiosk_id" UUID,
    "event_shift_id" UUID,
    "session_date" DATE NOT NULL,
    "check_in_punch_id" UUID NOT NULL,
    "check_out_punch_id" UUID,
    "status" "attendance_session_status" NOT NULL DEFAULT 'OPEN',
    "scheduled_minutes" INTEGER,
    "actual_minutes" INTEGER,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "net_minutes" INTEGER,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_departure_minutes" INTEGER NOT NULL DEFAULT 0,
    "potential_overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_overtime_approvals" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "attendance_session_id" UUID NOT NULL,
    "potential_minutes" INTEGER NOT NULL,
    "requested_reason" TEXT,
    "status" "attendance_overtime_status" NOT NULL DEFAULT 'PENDING',
    "approved_minutes" INTEGER,
    "decision_reason" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_overtime_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_exceptions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "attendance_session_id" UUID,
    "employee_id" UUID NOT NULL,
    "type" "attendance_exception_type" NOT NULL,
    "description" TEXT,
    "requested_check_in_at" TIMESTAMPTZ(6),
    "requested_check_out_at" TIMESTAMPTZ(6),
    "status" "attendance_exception_status" NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "requires_documentation" BOOLEAN NOT NULL DEFAULT false,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_grants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "granted_days" INTEGER NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_ledger_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "grant_id" UUID,
    "kind" "leave_ledger_entry_kind" NOT NULL,
    "amount_days" INTEGER NOT NULL,
    "leave_request_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days_requested" INTEGER NOT NULL,
    "reason" TEXT,
    "supporting_document_managed_file_id" UUID,
    "status" "leave_request_status" NOT NULL DEFAULT 'PENDING',
    "amends_request_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_kiosks_token_hash_key" ON "attendance_kiosks"("token_hash");

-- CreateIndex
CREATE INDEX "attendance_kiosks_is_active_idx" ON "attendance_kiosks"("is_active");

-- CreateIndex
CREATE INDEX "event_shifts_event_id_idx" ON "event_shifts"("event_id");

-- CreateIndex
CREATE INDEX "event_shifts_planned_start_at_idx" ON "event_shifts"("planned_start_at");

-- CreateIndex
CREATE INDEX "event_shifts_status_idx" ON "event_shifts"("status");

-- CreateIndex
CREATE INDEX "event_shift_assignments_employee_id_idx" ON "event_shift_assignments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_shift_assignments_event_shift_id_employee_id_key" ON "event_shift_assignments"("event_shift_id", "employee_id");

-- CreateIndex
CREATE INDEX "event_shift_changes_event_shift_id_created_at_idx" ON "event_shift_changes"("event_shift_id", "created_at");

-- CreateIndex
CREATE INDEX "attendance_punches_employee_id_recorded_at_idx" ON "attendance_punches"("employee_id", "recorded_at");

-- CreateIndex
CREATE INDEX "attendance_punches_kiosk_id_idx" ON "attendance_punches"("kiosk_id");

-- CreateIndex
CREATE INDEX "attendance_punches_event_shift_id_idx" ON "attendance_punches"("event_shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_employee_id_punch_type_client_request_id_key" ON "attendance_punches"("employee_id", "punch_type", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_check_in_punch_id_key" ON "attendance_sessions"("check_in_punch_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_check_out_punch_id_key" ON "attendance_sessions"("check_out_punch_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_employee_id_session_date_idx" ON "attendance_sessions"("employee_id", "session_date");

-- CreateIndex
CREATE INDEX "attendance_sessions_event_shift_id_idx" ON "attendance_sessions"("event_shift_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_status_idx" ON "attendance_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_overtime_approvals_attendance_session_id_key" ON "attendance_overtime_approvals"("attendance_session_id");

-- CreateIndex
CREATE INDEX "attendance_overtime_approvals_status_idx" ON "attendance_overtime_approvals"("status");

-- CreateIndex
CREATE INDEX "attendance_exceptions_employee_id_status_idx" ON "attendance_exceptions"("employee_id", "status");

-- CreateIndex
CREATE INDEX "attendance_exceptions_status_idx" ON "attendance_exceptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_name_key" ON "leave_types"("name");

-- CreateIndex
CREATE INDEX "leave_types_is_active_idx" ON "leave_types"("is_active");

-- CreateIndex
CREATE INDEX "leave_grants_employee_id_leave_type_id_idx" ON "leave_grants"("employee_id", "leave_type_id");

-- CreateIndex
CREATE INDEX "leave_grants_expires_at_idx" ON "leave_grants"("expires_at");

-- CreateIndex
CREATE INDEX "leave_ledger_entries_employee_id_leave_type_id_idx" ON "leave_ledger_entries"("employee_id", "leave_type_id");

-- CreateIndex
CREATE INDEX "leave_ledger_entries_grant_id_idx" ON "leave_ledger_entries"("grant_id");

-- CreateIndex
CREATE INDEX "leave_ledger_entries_leave_request_id_idx" ON "leave_ledger_entries"("leave_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_supporting_document_managed_file_id_key" ON "leave_requests"("supporting_document_managed_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_amends_request_id_key" ON "leave_requests"("amends_request_id");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_status_idx" ON "leave_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_leave_type_id_idx" ON "leave_requests"("leave_type_id");

-- CreateIndex
CREATE INDEX "leave_requests_start_date_end_date_idx" ON "leave_requests"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "managed_files_intent_leave_request_id_idx" ON "managed_files"("intent_leave_request_id");

-- AddForeignKey
ALTER TABLE "managed_files" ADD CONSTRAINT "managed_files_intent_leave_request_id_fkey" FOREIGN KEY ("intent_leave_request_id") REFERENCES "leave_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_kiosks" ADD CONSTRAINT "attendance_kiosks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_kiosks" ADD CONSTRAINT "attendance_kiosks_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shifts" ADD CONSTRAINT "event_shifts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shifts" ADD CONSTRAINT "event_shifts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shift_assignments" ADD CONSTRAINT "event_shift_assignments_event_shift_id_fkey" FOREIGN KEY ("event_shift_id") REFERENCES "event_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shift_assignments" ADD CONSTRAINT "event_shift_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shift_assignments" ADD CONSTRAINT "event_shift_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shift_assignments" ADD CONSTRAINT "event_shift_assignments_unassigned_by_id_fkey" FOREIGN KEY ("unassigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shift_changes" ADD CONSTRAINT "event_shift_changes_event_shift_id_fkey" FOREIGN KEY ("event_shift_id") REFERENCES "event_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shift_changes" ADD CONSTRAINT "event_shift_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_kiosk_id_fkey" FOREIGN KEY ("kiosk_id") REFERENCES "attendance_kiosks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_event_shift_id_fkey" FOREIGN KEY ("event_shift_id") REFERENCES "event_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_kiosk_id_fkey" FOREIGN KEY ("kiosk_id") REFERENCES "attendance_kiosks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_event_shift_id_fkey" FOREIGN KEY ("event_shift_id") REFERENCES "event_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_check_in_punch_id_fkey" FOREIGN KEY ("check_in_punch_id") REFERENCES "attendance_punches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_check_out_punch_id_fkey" FOREIGN KEY ("check_out_punch_id") REFERENCES "attendance_punches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_overtime_approvals" ADD CONSTRAINT "attendance_overtime_approvals_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_overtime_approvals" ADD CONSTRAINT "attendance_overtime_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "leave_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_supporting_document_managed_file_id_fkey" FOREIGN KEY ("supporting_document_managed_file_id") REFERENCES "managed_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_amends_request_id_fkey" FOREIGN KEY ("amends_request_id") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma's schema DSL cannot express CHECK constraints or partial unique
-- indexes, so everything below is hand-authored, following the exact
-- precedent set by the Letters/Documents/Sharing migrations in this
-- repository (see 20261020140000_add_letters_documents_sharing).

-- The real guarantee behind "no duplicate check-in, no check-out without a
-- check-in": at most one OPEN session per employee at any time. A second
-- check-in attempt while one is already open is rejected by this index,
-- not by application code alone.
CREATE UNIQUE INDEX "attendance_sessions_one_open_per_employee"
  ON "attendance_sessions" ("employee_id")
  WHERE "status" = 'OPEN';

-- A session's method determines exactly which parent it is scoped to.
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_method_target" CHECK (
  ("method" = 'OFFICE_KIOSK' AND "kiosk_id" IS NOT NULL AND "event_shift_id" IS NULL) OR
  ("method" = 'MOBILE_EVENT' AND "event_shift_id" IS NOT NULL AND "kiosk_id" IS NULL)
);

ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_minutes_nonnegative" CHECK (
  ("scheduled_minutes" IS NULL OR "scheduled_minutes" >= 0) AND
  ("actual_minutes" IS NULL OR "actual_minutes" >= 0) AND
  "break_minutes" >= 0 AND
  ("net_minutes" IS NULL OR "net_minutes" >= 0) AND
  "late_minutes" >= 0 AND
  "early_departure_minutes" >= 0 AND
  "potential_overtime_minutes" >= 0
);

-- Same method/target exclusivity on the raw punch log.
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_method_target" CHECK (
  ("method" = 'OFFICE_KIOSK' AND "kiosk_id" IS NOT NULL AND "event_shift_id" IS NULL) OR
  ("method" = 'MOBILE_EVENT' AND "event_shift_id" IS NOT NULL AND "kiosk_id" IS NULL)
);

-- An office-kiosk punch never carries location data, and never anything
-- other than the NOT_APPLICABLE verification result; a mobile-event punch
-- always resolves to a real verification outcome, never NOT_APPLICABLE.
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_location_fields_consistency" CHECK (
  ("method" = 'OFFICE_KIOSK' AND "latitude" IS NULL AND "longitude" IS NULL AND "accuracy_meters" IS NULL AND "distance_meters" IS NULL AND "verification_result" = 'NOT_APPLICABLE') OR
  ("method" = 'MOBILE_EVENT' AND "verification_result" <> 'NOT_APPLICABLE')
);

-- An overnight-safe shift window: end strictly after start (crossing
-- midnight is still exactly one row, so this never needs special-casing).
ALTER TABLE "event_shifts" ADD CONSTRAINT "event_shifts_end_after_start" CHECK ("planned_end_at" > "planned_start_at");
ALTER TABLE "event_shifts" ADD CONSTRAINT "event_shifts_geofence_radius_positive" CHECK ("geofence_radius_meters" > 0);
ALTER TABLE "event_shifts" ADD CONSTRAINT "event_shifts_break_minutes_nonnegative" CHECK ("break_minutes" >= 0);

-- A decision's reviewer/timestamp pair is set together, and only once the
-- status actually leaves PENDING - the same "decision fields pair with the
-- decision" convention used across the rest of this schema.
ALTER TABLE "attendance_overtime_approvals" ADD CONSTRAINT "attendance_overtime_approvals_decision_consistency" CHECK (
  ("status" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_id" IS NULL AND "approved_minutes" IS NULL) OR
  ("status" IN ('APPROVED', 'REJECTED') AND "decided_at" IS NOT NULL)
);
ALTER TABLE "attendance_overtime_approvals" ADD CONSTRAINT "attendance_overtime_approvals_minutes_nonnegative" CHECK (
  "potential_minutes" >= 0 AND ("approved_minutes" IS NULL OR "approved_minutes" >= 0)
);

ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_review_consistency" CHECK (
  ("status" = 'PENDING' AND "reviewed_at" IS NULL AND "reviewed_by_id" IS NULL) OR
  ("status" IN ('APPROVED', 'REJECTED') AND "reviewed_at" IS NOT NULL)
);

ALTER TABLE "attendance_kiosks" ADD CONSTRAINT "attendance_kiosks_revoked_actor" CHECK (
  ("revoked_at" IS NULL) = ("revoked_by_id" IS NULL)
);

-- Leave grants: a positive, time-bounded entitlement, valid for exactly the
-- window it was created with.
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_days_positive" CHECK ("granted_days" > 0);
ALTER TABLE "leave_grants" ADD CONSTRAINT "leave_grants_expiry_after_grant" CHECK ("expires_at" > "granted_at");

-- Ledger entries: never a zero-amount no-op row, and the sign must match
-- what the entry's own kind means (a GRANT/REVERSAL always adds, a
-- CONSUMPTION/EXPIRY always subtracts; ADJUSTMENT may go either way).
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_amount_nonzero" CHECK ("amount_days" <> 0);
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_amount_sign_matches_kind" CHECK (
  ("kind" IN ('GRANT', 'REVERSAL') AND "amount_days" > 0) OR
  ("kind" IN ('CONSUMPTION', 'EXPIRY') AND "amount_days" < 0) OR
  ("kind" = 'ADJUSTMENT')
);
-- Idempotency for the daily expiry job: retrying it can never expire the
-- same grant's remainder twice.
CREATE UNIQUE INDEX "leave_ledger_entries_one_expiry_per_grant"
  ON "leave_ledger_entries" ("grant_id")
  WHERE "kind" = 'EXPIRY';

-- Leave requests: a well-formed full-day range, and the same
-- decision-fields-pair-with-the-decision convention as above.
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_date_order" CHECK ("end_date" >= "start_date");
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_days_positive" CHECK ("days_requested" > 0);
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_review_consistency" CHECK (
  ("status" IN ('PENDING', 'WITHDRAWN') AND "reviewed_at" IS NULL AND "reviewed_by_id" IS NULL) OR
  ("status" IN ('APPROVED', 'REJECTED', 'RETURNED_FOR_CHANGES', 'AMENDED') AND "reviewed_at" IS NOT NULL)
);
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_no_self_amendment" CHECK (
  "amends_request_id" IS NULL OR "amends_request_id" <> "id"
);

