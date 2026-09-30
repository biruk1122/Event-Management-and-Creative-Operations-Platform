CREATE TYPE "report_type" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "report_status" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'CHANGES_REQUESTED');
CREATE TYPE "report_review_outcome" AS ENUM ('REVIEWED', 'CHANGES_REQUESTED');

CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "type" "report_type" NOT NULL,
    "title" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "author_id" UUID NOT NULL,
    "department_id" UUID,
    "status" "report_status" NOT NULL DEFAULT 'DRAFT',
    "problems_encountered" TEXT,
    "next_day_plan" TEXT,
    "department_activities" TEXT,
    "major_achievements" TEXT,
    "challenges" TEXT,
    "next_week_plan" TEXT,
    "department_performance" TEXT,
    "employee_performance" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reports_title_not_blank" CHECK (btrim("title") <> ''),
    CONSTRAINT "reports_period_shape" CHECK (
        ("type" = 'DAILY' AND "period_end" = "period_start") OR
        ("type" = 'WEEKLY' AND "period_end" = "period_start" + 6) OR
        ("type" = 'MONTHLY' AND EXTRACT(DAY FROM "period_start") = 1
            AND "period_end" = ("period_start" + INTERVAL '1 month - 1 day')::date)
    ),
    CONSTRAINT "reports_section_type" CHECK (
        ("type" = 'DAILY' AND "department_activities" IS NULL
            AND "major_achievements" IS NULL AND "challenges" IS NULL
            AND "next_week_plan" IS NULL AND "department_performance" IS NULL
            AND "employee_performance" IS NULL) OR
        ("type" = 'WEEKLY' AND "problems_encountered" IS NULL
            AND "next_day_plan" IS NULL AND "department_performance" IS NULL
            AND "employee_performance" IS NULL) OR
        ("type" = 'MONTHLY' AND "problems_encountered" IS NULL
            AND "next_day_plan" IS NULL AND "department_activities" IS NULL
            AND "next_week_plan" IS NULL)
    ),
    CONSTRAINT "reports_sections_not_blank" CHECK (
        ("problems_encountered" IS NULL OR btrim("problems_encountered") <> '') AND
        ("next_day_plan" IS NULL OR btrim("next_day_plan") <> '') AND
        ("department_activities" IS NULL OR btrim("department_activities") <> '') AND
        ("major_achievements" IS NULL OR btrim("major_achievements") <> '') AND
        ("challenges" IS NULL OR btrim("challenges") <> '') AND
        ("next_week_plan" IS NULL OR btrim("next_week_plan") <> '') AND
        ("department_performance" IS NULL OR btrim("department_performance") <> '') AND
        ("employee_performance" IS NULL OR btrim("employee_performance") <> '')
    ),
    CONSTRAINT "reports_review_state" CHECK (
        ("status" = 'DRAFT' AND "submitted_at" IS NULL
            AND "reviewed_at" IS NULL AND "reviewer_id" IS NULL) OR
        ("status" = 'SUBMITTED' AND "submitted_at" IS NOT NULL
            AND "reviewed_at" IS NULL AND "reviewer_id" IS NULL) OR
        ("status" IN ('REVIEWED', 'CHANGES_REQUESTED')
            AND "submitted_at" IS NOT NULL AND "reviewed_at" IS NOT NULL
            AND "reviewer_id" IS NOT NULL AND "reviewed_at" >= "submitted_at")
    )
);

CREATE UNIQUE INDEX "reports_author_id_type_period_start_key"
    ON "reports"("author_id", "type", "period_start");
CREATE INDEX "reports_author_id_type_period_start_id_idx"
    ON "reports"("author_id", "type", "period_start", "id");
CREATE INDEX "reports_department_id_type_period_start_id_idx"
    ON "reports"("department_id", "type", "period_start", "id");
CREATE INDEX "reports_status_type_period_start_id_idx"
    ON "reports"("status", "type", "period_start", "id");
CREATE INDEX "reports_reviewer_id_status_idx"
    ON "reports"("reviewer_id", "status");

ALTER TABLE "reports" ADD CONSTRAINT "reports_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "report_workspaces" (
    "report_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_workspaces_pkey" PRIMARY KEY ("report_id", "workspace_id")
);
CREATE INDEX "report_workspaces_workspace_id_report_id_idx"
    ON "report_workspaces"("workspace_id", "report_id");
ALTER TABLE "report_workspaces" ADD CONSTRAINT "report_workspaces_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_workspaces" ADD CONSTRAINT "report_workspaces_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "report_reviews" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "report_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "outcome" "report_review_outcome" NOT NULL,
    "note" TEXT,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "report_reviews_note_not_blank" CHECK ("note" IS NULL OR btrim("note") <> '')
);
CREATE INDEX "report_reviews_report_id_reviewed_at_id_idx"
    ON "report_reviews"("report_id", "reviewed_at", "id");
CREATE INDEX "report_reviews_reviewer_id_reviewed_at_idx"
    ON "report_reviews"("reviewer_id", "reviewed_at");
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
