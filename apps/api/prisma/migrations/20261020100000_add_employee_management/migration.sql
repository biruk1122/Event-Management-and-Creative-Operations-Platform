-- CreateEnum
CREATE TYPE "employment_type" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "employment_status" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "employee_gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateTable
CREATE TABLE "employee_profiles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "employment_type" "employment_type" NOT NULL,
    "employment_date" DATE NOT NULL,
    "employment_status" "employment_status" NOT NULL DEFAULT 'ACTIVE',
    "work_location" TEXT,
    "reporting_manager_id" UUID,
    "grade" TEXT,
    "base_salary" DECIMAL(14,2),
    "salary_scale" TEXT,
    "allowance_amount" DECIMAL(14,2),
    "currency" CHAR(3),
    "description" TEXT,
    "gender" "employee_gender",
    "date_of_birth" DATE,
    "city" TEXT,
    "sub_city" TEXT,
    "woreda" TEXT,
    "status_changed_at" TIMESTAMPTZ(6),
    "status_changed_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_user_id_key" ON "employee_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_employee_code_key" ON "employee_profiles"("employee_code");

-- CreateIndex
CREATE INDEX "employee_profiles_employment_status_idx" ON "employee_profiles"("employment_status");

-- CreateIndex
CREATE INDEX "employee_profiles_reporting_manager_id_idx" ON "employee_profiles"("reporting_manager_id");

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_reporting_manager_id_fkey" FOREIGN KEY ("reporting_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_status_changed_by_id_fkey" FOREIGN KEY ("status_changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: employee_code and position are never blank strings.
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_employee_code_not_blank"
    CHECK (btrim("employee_code") <> '');

ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_position_not_blank"
    CHECK (btrim("position") <> '');

-- CheckConstraint: compensation amounts and currency are all-or-nothing,
-- mirroring "campaigns_budget_amount_and_currency"'s convention - either no
-- compensation is recorded at all, or at least one amount is present, every
-- present amount is non-negative, and currency is a valid ISO-4217 code.
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_compensation_and_currency"
    CHECK (
        (
            "base_salary" IS NULL
            AND "allowance_amount" IS NULL
            AND "currency" IS NULL
        )
        OR (
            ("base_salary" IS NULL OR "base_salary" >= 0)
            AND ("allowance_amount" IS NULL OR "allowance_amount" >= 0)
            AND ("base_salary" IS NOT NULL OR "allowance_amount" IS NOT NULL)
            AND "currency" IS NOT NULL
            AND "currency" ~ '^[A-Z]{3}$'
        )
    );

-- CheckConstraint: an employee can never be their own reporting manager.
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_not_own_manager"
    CHECK ("reporting_manager_id" IS NULL OR "reporting_manager_id" <> "user_id");

-- CheckConstraint: a status change timestamp always carries an actor, and
-- vice versa - EMP-01 requires every status change to be attributable.
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_status_change_actor"
    CHECK (
        ("status_changed_at" IS NULL AND "status_changed_by_id" IS NULL)
        OR ("status_changed_at" IS NOT NULL AND "status_changed_by_id" IS NOT NULL)
    );
