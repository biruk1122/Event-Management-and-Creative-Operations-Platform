-- Bind each new upload intent to the concrete workspace authorized at intent
-- creation. The column stays nullable so a database upgraded from FIL-01 does
-- not fabricate a parent for historical records; FIL-02 does not finalize a
-- null-parent intent.
ALTER TABLE "managed_files"
    ADD COLUMN "intent_workspace_id" UUID;

ALTER TABLE "managed_files"
    ADD CONSTRAINT "managed_files_intent_workspace_id_fkey"
    FOREIGN KEY ("intent_workspace_id")
    REFERENCES "workspaces"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

CREATE INDEX "managed_files_intent_workspace_id_idx"
    ON "managed_files"("intent_workspace_id");
