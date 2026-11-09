-- EVE-231: promotion activity location, required resources and staffing.
--
-- Additive only. Existing promotion activities keep NULL location and resources
-- and no assignees.

ALTER TABLE "promotion_activities" ADD COLUMN "location" TEXT;
ALTER TABLE "promotion_activities" ADD COLUMN "required_resources" TEXT;

ALTER TABLE "promotion_activities"
    ADD CONSTRAINT "promotion_activities_location_not_blank"
    CHECK ("location" IS NULL OR btrim("location") <> '');
ALTER TABLE "promotion_activities"
    ADD CONSTRAINT "promotion_activities_required_resources_not_blank"
    CHECK ("required_resources" IS NULL OR btrim("required_resources") <> '');

-- Who works an activity. Only employees of the campaign's department may be
-- assigned, and only while active. The trigger below enforces that for every
-- write, so a concurrent change to a user or campaign cannot slip past the
-- service check.
CREATE TABLE "promotion_activity_assignees" (
    "campaign_activity_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_activity_assignees_pkey" PRIMARY KEY ("campaign_activity_id", "user_id")
);
CREATE INDEX "promotion_activity_assignees_user_id_idx" ON "promotion_activity_assignees"("user_id");
ALTER TABLE "promotion_activity_assignees"
    ADD CONSTRAINT "promotion_activity_assignees_activity_fkey"
    FOREIGN KEY ("campaign_activity_id") REFERENCES "promotion_activities"("campaign_activity_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_activity_assignees"
    ADD CONSTRAINT "promotion_activity_assignees_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_activity_assignees"
    ADD CONSTRAINT "promotion_activity_assignees_assigned_by_id_fkey"
    FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "promotion_activity_assignee_department_check"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    campaign_department UUID;
    user_department UUID;
    user_status TEXT;
    department_deactivated TIMESTAMPTZ;
BEGIN
    SELECT c."department_id"
      INTO campaign_department
      FROM "promotion_activities" pa
      JOIN "campaigns" c ON c."id" = pa."campaign_id"
     WHERE pa."campaign_activity_id" = NEW."campaign_activity_id"
       FOR SHARE OF c;

    -- The user row is locked for the duration of this write, so a concurrent
    -- move out of the department or deactivation waits for it.
    SELECT u."department_id", u."status"::TEXT
      INTO user_department, user_status
      FROM "users" u
     WHERE u."id" = NEW."user_id"
       FOR SHARE OF u;

    IF campaign_department IS NULL
       OR user_department IS DISTINCT FROM campaign_department
       OR user_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'assignee must be an active employee of the promotion department'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'promotion_activity_assignees_department';
    END IF;

    SELECT d."deactivated_at" INTO department_deactivated
      FROM "departments" d
     WHERE d."id" = campaign_department;
    IF department_deactivated IS NOT NULL THEN
        RAISE EXCEPTION 'assignee must be an active employee of the promotion department'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'promotion_activity_assignees_department';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "promotion_activity_assignees_department_check"
    BEFORE INSERT OR UPDATE ON "promotion_activity_assignees"
    FOR EACH ROW EXECUTE FUNCTION "promotion_activity_assignee_department_check"();
