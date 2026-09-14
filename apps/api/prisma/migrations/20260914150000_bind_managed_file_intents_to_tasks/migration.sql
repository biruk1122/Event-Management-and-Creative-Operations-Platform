-- A task-scoped upload intent needs its own explicit authorization parent.
-- This supports department-only tasks without fabricating a workspace and
-- prevents finalizing an intent against a different task.
ALTER TABLE "managed_files"
    ADD COLUMN "intent_task_id" UUID;

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_intent_task_id_fkey"
    FOREIGN KEY ("intent_task_id")
    REFERENCES "tasks"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

CREATE INDEX "managed_files_intent_task_id_idx"
    ON "managed_files"("intent_task_id");

-- Historical rows may have neither parent. New application writes always set
-- exactly one; the database prevents an ambiguous dual-parent intent.
ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_intent_parent_exclusive"
    CHECK ("intent_workspace_id" IS NULL OR "intent_task_id" IS NULL);
