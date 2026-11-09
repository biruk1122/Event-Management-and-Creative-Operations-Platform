-- EVE-229: department oversight (docs/decisions/0008-department-oversight.md).
--
-- Additive and backward-compatible. A department may name one overseeing
-- department. The overseeing department's manager gets read-only access to the
-- overseen department's records, and Department Manager reports from the
-- overseen department are routed to that manager. A NULL link (every existing
-- department) keeps today's behavior exactly.

ALTER TABLE "departments" ADD COLUMN "oversight_department_id" UUID;

ALTER TABLE "departments"
    ADD CONSTRAINT "departments_oversight_department_id_fkey"
    FOREIGN KEY ("oversight_department_id") REFERENCES "departments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "departments"
    ADD CONSTRAINT "departments_oversight_not_self"
    CHECK ("oversight_department_id" IS NULL OR "oversight_department_id" <> "id");

CREATE INDEX "departments_oversight_department_id_idx"
    ON "departments"("oversight_department_id");

-- One level only: an overseeing department cannot itself be overseen, and an
-- overseen department cannot oversee another. A CHECK cannot look at other
-- rows, so a trigger enforces it. The row locks make two concurrent links
-- that would form a chain wait for each other instead of both succeeding.
CREATE FUNCTION "departments_oversight_one_level"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."oversight_department_id" IS NOT NULL THEN
        PERFORM 1 FROM "departments"
            WHERE "id" = NEW."oversight_department_id" FOR UPDATE;
        IF EXISTS (
            SELECT 1 FROM "departments"
            WHERE "id" = NEW."oversight_department_id"
              AND "oversight_department_id" IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'An overseeing department cannot itself be overseen'
                USING ERRCODE = '23514',
                      CONSTRAINT = 'departments_oversight_one_level';
        END IF;
        IF EXISTS (
            SELECT 1 FROM "departments"
            WHERE "oversight_department_id" = NEW."id"
        ) THEN
            RAISE EXCEPTION 'A department that oversees others cannot be overseen'
                USING ERRCODE = '23514',
                      CONSTRAINT = 'departments_oversight_one_level';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "departments_oversight_one_level"
    BEFORE INSERT OR UPDATE OF "oversight_department_id" ON "departments"
    FOR EACH ROW EXECUTE FUNCTION "departments_oversight_one_level"();

-- Data step: Promotion is overseen by Marketing. Matched by name (both rows
-- are seeded by 20261013120000_department_rbac_catalog and
-- 20261019120000_marketing_department_workspace); skipped when either is
-- missing, and never overwrites a link someone already set.
UPDATE "departments" AS promotion
SET "oversight_department_id" = marketing."id"
FROM "departments" AS marketing
WHERE promotion."name" = 'Promotion'
  AND marketing."name" = 'Marketing'
  AND promotion."oversight_department_id" IS NULL;
