-- CreateEnum
CREATE TYPE "production_location_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'CONFIRMED', 'READY');

-- AlterTable
ALTER TABLE "productions" ADD COLUMN     "budget_amount" DECIMAL(14,2),
ADD COLUMN     "budget_currency" CHAR(3),
ADD COLUMN     "department_id" UUID;

-- CreateTable
CREATE TABLE "production_locations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "production_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "description" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "status" "production_location_status" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_locations_production_id_status_idx" ON "production_locations"("production_id", "status");

-- CreateIndex
CREATE INDEX "productions_department_id_status_idx" ON "productions"("department_id", "status");

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_locations" ADD CONSTRAINT "production_locations_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_locations" ADD CONSTRAINT "production_locations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
