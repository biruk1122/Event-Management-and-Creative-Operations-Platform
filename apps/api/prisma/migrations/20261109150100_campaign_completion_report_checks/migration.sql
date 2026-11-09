-- EVE-234: let campaign completion reports satisfy the report CHECKs. A new
-- enum value cannot be used in the transaction that adds it, so this runs as
-- its own migration after 20261109150000_campaign_completion_report.
--
-- The DAILY, WEEKLY and MONTHLY branches are unchanged. A completion report
-- covers the campaign's own window (any start on or before its end) and
-- carries only the completion sections: results and achievements
-- (major_achievements), challenges, lessons learned and recommendations.

ALTER TABLE "reports" DROP CONSTRAINT "reports_period_shape";
ALTER TABLE "reports" ADD CONSTRAINT "reports_period_shape" CHECK (
    ("type" = 'DAILY' AND "period_end" = "period_start") OR
    ("type" = 'WEEKLY' AND "period_end" = "period_start" + 6) OR
    ("type" = 'MONTHLY' AND EXTRACT(DAY FROM "period_start") = 1
        AND "period_end" = ("period_start" + INTERVAL '1 month - 1 day')::date) OR
    ("type" = 'CAMPAIGN_COMPLETION' AND "period_end" >= "period_start")
);

ALTER TABLE "reports" DROP CONSTRAINT "reports_section_type";
ALTER TABLE "reports" ADD CONSTRAINT "reports_section_type" CHECK (
    ("type" = 'DAILY' AND "department_activities" IS NULL
        AND "major_achievements" IS NULL AND "challenges" IS NULL
        AND "next_week_plan" IS NULL AND "department_performance" IS NULL
        AND "employee_performance" IS NULL) OR
    ("type" = 'WEEKLY' AND "problems_encountered" IS NULL
        AND "next_day_plan" IS NULL AND "department_performance" IS NULL
        AND "employee_performance" IS NULL) OR
    ("type" = 'MONTHLY' AND "problems_encountered" IS NULL
        AND "next_day_plan" IS NULL AND "department_activities" IS NULL
        AND "next_week_plan" IS NULL) OR
    ("type" = 'CAMPAIGN_COMPLETION' AND "problems_encountered" IS NULL
        AND "next_day_plan" IS NULL AND "department_activities" IS NULL
        AND "next_week_plan" IS NULL AND "department_performance" IS NULL
        AND "employee_performance" IS NULL)
);
