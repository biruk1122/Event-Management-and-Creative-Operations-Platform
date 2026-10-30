-- CreateEnum
CREATE TYPE "partner_status" AS ENUM ('PROSPECTIVE', 'IN_DISCUSSION', 'COMMITTED', 'DECLINED', 'COMPLETED');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "department_id" UUID;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "campaign_id" UUID;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "parent_task_id" UUID;

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "department_id" UUID,
    "campaign_id" UUID,
    "event_id" UUID,
    "status" "partner_status" NOT NULL DEFAULT 'PROSPECTIVE',
    "proposed_contribution" TEXT,
    "notes" TEXT,
    "follow_up_at" TIMESTAMPTZ(6),
    "owner_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_activities" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "partner_id" UUID NOT NULL,
    "author_id" UUID,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_department_id_status_idx" ON "partners"("department_id", "status");

-- CreateIndex
CREATE INDEX "partners_campaign_id_idx" ON "partners"("campaign_id");

-- CreateIndex
CREATE INDEX "partners_event_id_idx" ON "partners"("event_id");

-- CreateIndex
CREATE INDEX "partners_owner_id_idx" ON "partners"("owner_id");

-- CreateIndex
CREATE INDEX "partners_follow_up_at_idx" ON "partners"("follow_up_at");

-- CreateIndex
CREATE INDEX "partner_activities_partner_id_created_at_idx" ON "partner_activities"("partner_id", "created_at");

-- CreateIndex
CREATE INDEX "campaigns_department_id_idx" ON "campaigns"("department_id");

-- CreateIndex
CREATE INDEX "expenses_campaign_id_status_idx" ON "expenses"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks"("parent_task_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_activities" ADD CONSTRAINT "partner_activities_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_activities" ADD CONSTRAINT "partner_activities_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the "Marketing" department row for real (it is already an allow-listed
-- platform department name in department-access.policy.ts, but - outside
-- e2e provisioning - nothing previously created the actual row). Idempotent:
-- mirrors the exact pattern 20261013120000_department_rbac_catalog used to
-- seed Production/Marketing/Promotion/"Manager / Event & Office Manager".
INSERT INTO "departments" ("name", "updated_at")
VALUES ('Marketing', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
