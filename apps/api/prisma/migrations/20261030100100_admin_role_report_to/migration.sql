-- Admin role + per-task / per-report reporting recipients.
--
-- Purely additive and backward-compatible: every new column is nullable (or
-- defaulted) and nothing is backfilled, so existing tasks and reports keep a
-- NULL recipient and therefore keep their earlier review behavior. The Admin
-- role row and its grants are seed data (seedRbac), not part of this
-- migration, like the other system roles.

-- Tasks: who receives a task's reports and decides its review.
ALTER TABLE "tasks" ADD COLUMN "report_to_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "report_to_pinned" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "tasks_report_to_id_idx" ON "tasks"("report_to_id");
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_report_to_id_fkey"
    FOREIGN KEY ("report_to_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Departments: the Admin Super Admin designated to receive the department's
-- department-level reports.
ALTER TABLE "departments" ADD COLUMN "reporting_admin_id" UUID;
CREATE INDEX "departments_reporting_admin_id_idx" ON "departments"("reporting_admin_id");
ALTER TABLE "departments"
    ADD CONSTRAINT "departments_reporting_admin_id_fkey"
    FOREIGN KEY ("reporting_admin_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Reports: who the report is submitted to.
ALTER TABLE "reports" ADD COLUMN "report_to_id" UUID;
CREATE INDEX "reports_report_to_id_status_idx" ON "reports"("report_to_id", "status");
ALTER TABLE "reports"
    ADD CONSTRAINT "reports_report_to_id_fkey"
    FOREIGN KEY ("report_to_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Consolidation: the department reports an Admin folded into one report.
CREATE TABLE "report_sources" (
    "report_id" UUID NOT NULL,
    "source_report_id" UUID NOT NULL,
    CONSTRAINT "report_sources_pkey" PRIMARY KEY ("report_id", "source_report_id"),
    CONSTRAINT "report_sources_not_self" CHECK ("report_id" <> "source_report_id")
);
CREATE INDEX "report_sources_source_report_id_idx" ON "report_sources"("source_report_id");
ALTER TABLE "report_sources"
    ADD CONSTRAINT "report_sources_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_sources"
    ADD CONSTRAINT "report_sources_source_report_id_fkey"
    FOREIGN KEY ("source_report_id") REFERENCES "reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
