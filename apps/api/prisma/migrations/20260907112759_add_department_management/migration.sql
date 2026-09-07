-- AlterTable
ALTER TABLE "users" ADD COLUMN     "department_id" UUID;

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manager_id" UUID,
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_manager_id_idx" ON "departments"("manager_id");

-- CreateIndex
CREATE INDEX "departments_deactivated_at_idx" ON "departments"("deactivated_at");

-- CreateIndex
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A department name is always real text, never blank or whitespace-only. A
-- present description is held to the same rule; NULL means "not provided" and
-- stays allowed. (Prisma cannot express CHECK constraints, so they are added
-- here by hand, matching users_*_not_blank from USR-01.)
ALTER TABLE "departments"
    ADD CONSTRAINT "departments_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "departments"
    ADD CONSTRAINT "departments_description_not_blank"
    CHECK ("description" IS NULL OR btrim("description") <> '');
