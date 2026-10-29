-- Adds the HR & Executive Officer department to the platform department
-- allow-list (see PLATFORM_DEPARTMENTS in department-access.policy.ts).
-- Idempotent: safe to re-run against a database that already has this row.
INSERT INTO "departments" ("name", "updated_at")
VALUES ('HR & Executive Officer', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
