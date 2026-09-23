CREATE TYPE "production_status" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "productions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "production_type" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "deadline_at" TIMESTAMPTZ(6),
    "status" "production_status" NOT NULL DEFAULT 'PLANNED',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "productions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "productions_workspace_id_key" UNIQUE ("workspace_id"),
    CONSTRAINT "productions_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "productions_type_not_blank" CHECK (btrim("production_type") <> ''),
    CONSTRAINT "productions_dates_valid" CHECK ("end_at" IS NULL OR "start_at" IS NULL OR "end_at" >= "start_at")
);

CREATE TABLE "production_talents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "production_id" UUID NOT NULL,
    "talent_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_talents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_talents_production_id_talent_id_key" UNIQUE ("production_id", "talent_id"),
    CONSTRAINT "production_talents_role_not_blank" CHECK (btrim("role") <> '')
);

ALTER TABLE "productions" ADD CONSTRAINT "productions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "productions" ADD CONSTRAINT "productions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_talents" ADD CONSTRAINT "production_talents_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_talents" ADD CONSTRAINT "production_talents_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "talents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "productions_status_idx" ON "productions"("status");
CREATE INDEX "productions_production_type_status_idx" ON "productions"("production_type", "status");
CREATE INDEX "productions_deadline_at_idx" ON "productions"("deadline_at");
CREATE INDEX "productions_created_by_id_idx" ON "productions"("created_by_id");
CREATE INDEX "production_talents_talent_id_idx" ON "production_talents"("talent_id");
