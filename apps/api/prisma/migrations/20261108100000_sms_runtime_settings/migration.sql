-- Phase 5: persistent runtime SMS settings. Additive only.
-- Global delivery starts disabled. AFROMESSAGE_ENABLED (environment) still overrides it.

CREATE TABLE "sms_runtime_settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "global_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,

    CONSTRAINT "sms_runtime_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sms_runtime_settings_singleton_check" CHECK ("id" = 1)
);

ALTER TABLE "sms_runtime_settings" ADD CONSTRAINT "sms_runtime_settings_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "sms_runtime_settings" ("id", "global_enabled") VALUES (1, false);

CREATE TABLE "sms_category_settings" (
    "category" "sms_category" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,

    CONSTRAINT "sms_category_settings_pkey" PRIMARY KEY ("category")
);

ALTER TABLE "sms_category_settings" ADD CONSTRAINT "sms_category_settings_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
