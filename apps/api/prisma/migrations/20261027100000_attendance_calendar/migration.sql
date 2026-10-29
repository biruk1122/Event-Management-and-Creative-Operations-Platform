-- CreateEnum
CREATE TYPE "attendance_day_type" AS ENUM ('FULL', 'HALF', 'OFF');

-- CreateTable
CREATE TABLE "attendance_weekday_schedules" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "day_of_week" INTEGER NOT NULL,
    "type" "attendance_day_type" NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_weekday_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_holidays" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_weekday_schedules_day_of_week_effective_from_key" ON "attendance_weekday_schedules"("day_of_week", "effective_from");

-- CreateIndex
CREATE INDEX "attendance_weekday_schedules_day_of_week_effective_from_idx" ON "attendance_weekday_schedules"("day_of_week", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_holidays_date_key" ON "attendance_holidays"("date");

-- AddForeignKey
ALTER TABLE "attendance_weekday_schedules" ADD CONSTRAINT "attendance_weekday_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_holidays" ADD CONSTRAINT "attendance_holidays_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the baseline weekly schedule, effective from an anchor date safely
-- before any real attendance data, so every possible report date resolves
-- to a rule from day one: Sunday (0) off, Monday-Friday (1-5) full working
-- days, Saturday (6) a half working day.
INSERT INTO "attendance_weekday_schedules" ("day_of_week", "type", "effective_from")
VALUES
    (0, 'OFF', '1970-01-01'),
    (1, 'FULL', '1970-01-01'),
    (2, 'FULL', '1970-01-01'),
    (3, 'FULL', '1970-01-01'),
    (4, 'FULL', '1970-01-01'),
    (5, 'FULL', '1970-01-01'),
    (6, 'HALF', '1970-01-01')
ON CONFLICT ("day_of_week", "effective_from") DO NOTHING;
