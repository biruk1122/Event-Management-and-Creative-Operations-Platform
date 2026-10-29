-- Remove the Google Meet / Calendar integration entirely, in favor of
-- self-hosted Jitsi Meet. Jitsi rooms are derived deterministically from the
-- meeting id at request time and need no persisted state, so nothing is
-- added here beyond relaxing the old venue constraint.
ALTER TABLE "google_meet_exports" DROP CONSTRAINT IF EXISTS "google_meet_exports_meeting_id_fkey";
ALTER TABLE "google_meet_exports" DROP CONSTRAINT IF EXISTS "google_meet_exports_user_id_fkey";
DROP TABLE IF EXISTS "google_meet_exports";
DROP TABLE IF EXISTS "google_calendar_connections";
DROP TABLE IF EXISTS "google_calendar_consents";
DROP TABLE IF EXISTS "google_calendar_budgets";

-- Drop any artifact of the never-shipped automatic-generation migration, in
-- case a local dev database happened to apply it before it was removed.
ALTER TABLE "meetings" DROP COLUMN IF EXISTS "google_meet_requested";

-- Jitsi rooms need no stored link; drop online_link and simplify the venue
-- constraint accordingly (online/hybrid meetings no longer require one).
ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_type_details";
ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_online_link_not_blank";
ALTER TABLE "meetings" DROP COLUMN IF EXISTS "online_link";

ALTER TABLE "meetings" ADD CONSTRAINT "meetings_type_details" CHECK (
  ("type" = 'PHYSICAL' AND "location" IS NOT NULL) OR
  ("type" = 'ONLINE' AND "location" IS NULL) OR
  ("type" = 'HYBRID' AND "location" IS NOT NULL)
);
