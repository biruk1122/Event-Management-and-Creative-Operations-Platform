CREATE TABLE "google_calendar_connections" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "generation" uuid NOT NULL,
  "subject" text,
  "token" text,
  "status" text NOT NULL DEFAULT 'DISCONNECTED',
  "lease_id" uuid,
  "lease_until" timestamptz(6),
  CHECK ("status" IN ('CONNECTED','DISCONNECTED','RECONNECT_REQUIRED','REVOCATION_FAILED')),
  CHECK (("status" = 'CONNECTED') = ("token" IS NOT NULL)),
  CHECK (("lease_id" IS NULL) = ("lease_until" IS NULL))
);
CREATE TABLE "google_calendar_consents" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "state_hash" text NOT NULL UNIQUE,
  "session_id" uuid NOT NULL,
  "verifier" text NOT NULL,
  "expires_at" timestamptz(6) NOT NULL
);
CREATE INDEX "google_calendar_consents_expires_at_idx" ON "google_calendar_consents"("expires_at");
CREATE TABLE "google_meet_exports" (
  "meeting_id" uuid PRIMARY KEY REFERENCES "meetings"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "google_calendar_connections"("user_id") ON DELETE CASCADE,
  "generation" uuid NOT NULL,
  "event_id" text NOT NULL UNIQUE,
  "request_id" uuid NOT NULL,
  "published_link" text,
  "subject" text,
  "fallback_link" text,
  "status" text NOT NULL DEFAULT 'PENDING',
  "failure" text,
  "attempted_at" timestamptz(6),
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0 AND "attempts" <= 3),
  "next_attempt_at" timestamptz(6),
  CHECK ("status" IN ('PENDING','READY','FAILED','CLEANUP_PENDING','DETACHED'))
);
CREATE INDEX "google_meet_exports_user_id_idx" ON "google_meet_exports"("user_id");
CREATE TABLE "google_calendar_budgets" (
  "key" text PRIMARY KEY,
  "used" integer NOT NULL DEFAULT 0 CHECK ("used" >= 0),
  "expires_at" timestamptz(6) NOT NULL
);
CREATE INDEX "google_calendar_budgets_expires_at_idx" ON "google_calendar_budgets"("expires_at");
