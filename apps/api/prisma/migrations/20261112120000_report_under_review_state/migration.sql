-- A report under review keeps its submission time and reviewer, with no
-- decision time yet. The original check only knew DRAFT, SUBMITTED and the
-- final outcomes, so startReview() always violated it.
ALTER TABLE "reports" DROP CONSTRAINT "reports_review_state";

ALTER TABLE "reports" ADD CONSTRAINT "reports_review_state" CHECK (
    ("status" = 'DRAFT' AND "submitted_at" IS NULL
        AND "reviewed_at" IS NULL AND "reviewer_id" IS NULL) OR
    ("status" = 'SUBMITTED' AND "submitted_at" IS NOT NULL
        AND "reviewed_at" IS NULL AND "reviewer_id" IS NULL) OR
    ("status" = 'UNDER_REVIEW' AND "submitted_at" IS NOT NULL
        AND "reviewed_at" IS NULL AND "reviewer_id" IS NOT NULL) OR
    ("status" IN ('REVIEWED', 'CHANGES_REQUESTED')
        AND "submitted_at" IS NOT NULL AND "reviewed_at" IS NOT NULL
        AND "reviewer_id" IS NOT NULL AND "reviewed_at" >= "submitted_at")
);
