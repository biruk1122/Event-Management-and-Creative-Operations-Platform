-- Human-readable task identifiers (TSK-###) and optional event/campaign links.
-- Additive and backward-compatible: existing task rows keep every value they
-- have; only the new task_number column is written for them.

ALTER TABLE "tasks" ADD COLUMN "task_number" INTEGER;
ALTER TABLE "tasks" ADD COLUMN "related_event_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "related_campaign_id" UUID;

-- Number existing tasks in creation order (ties broken by id), so the numbering
-- is deterministic and reproducible.
WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS "n"
    FROM "tasks"
)
UPDATE "tasks" AS t
SET "task_number" = numbered."n"
FROM numbered
WHERE t."id" = numbered."id";

-- Concurrency-safe allocation: nextval() never hands out the same value twice.
-- The sequence resumes after the highest number already in use.
CREATE SEQUENCE "task_number_seq" AS INTEGER;
SELECT setval(
    'task_number_seq',
    COALESCE((SELECT MAX("task_number") FROM "tasks"), 0) + 1,
    false
);
ALTER SEQUENCE "task_number_seq" OWNED BY "tasks"."task_number";

ALTER TABLE "tasks" ALTER COLUMN "task_number" SET DEFAULT nextval('task_number_seq'::regclass);
ALTER TABLE "tasks" ALTER COLUMN "task_number" SET NOT NULL;
CREATE UNIQUE INDEX "tasks_task_number_key" ON "tasks"("task_number");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_related_event_id_fkey"
    FOREIGN KEY ("related_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_related_campaign_id_fkey"
    FOREIGN KEY ("related_campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tasks_related_event_id_idx" ON "tasks"("related_event_id");
CREATE INDEX "tasks_related_campaign_id_idx" ON "tasks"("related_campaign_id");
