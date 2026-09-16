-- CreateTable
CREATE TABLE "scheduled_occurrence_claims" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "rule_name" TEXT NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "resource_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_occurrence_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_occurrence_claims_rule_name_rule_version_resource_key" ON "scheduled_occurrence_claims"("rule_name", "rule_version", "resource_id", "scheduled_for");
