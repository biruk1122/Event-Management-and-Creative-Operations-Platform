CREATE TYPE "meeting_type" AS ENUM ('PHYSICAL', 'ONLINE', 'HYBRID');
CREATE TYPE "meeting_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "meeting_participant_response" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "meetings" (
  "id" UUID NOT NULL DEFAULT uuidv7(), "title" TEXT NOT NULL, "description" TEXT,
  "type" "meeting_type" NOT NULL, "status" "meeting_status" NOT NULL DEFAULT 'SCHEDULED',
  "organizer_id" UUID NOT NULL, "workspace_id" UUID, "start_at" TIMESTAMPTZ(6) NOT NULL,
  "end_at" TIMESTAMPTZ(6) NOT NULL, "location" TEXT, "online_link" TEXT,
  "reminder_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meetings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meetings_title_not_blank" CHECK (btrim("title") <> ''),
  CONSTRAINT "meetings_description_not_blank" CHECK ("description" IS NULL OR btrim("description") <> ''),
  CONSTRAINT "meetings_location_not_blank" CHECK ("location" IS NULL OR btrim("location") <> ''),
  CONSTRAINT "meetings_online_link_not_blank" CHECK ("online_link" IS NULL OR btrim("online_link") <> ''),
  CONSTRAINT "meetings_schedule_ordered" CHECK ("end_at" > "start_at"),
  CONSTRAINT "meetings_reminder_before_start" CHECK ("reminder_at" IS NULL OR "reminder_at" <= "start_at"),
  CONSTRAINT "meetings_type_details" CHECK (("type" = 'PHYSICAL' AND "location" IS NOT NULL AND "online_link" IS NULL) OR ("type" = 'ONLINE' AND "location" IS NULL AND "online_link" IS NOT NULL) OR ("type" = 'HYBRID' AND "location" IS NOT NULL AND "online_link" IS NOT NULL))
);
CREATE TABLE "meeting_participants" (
  "meeting_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "response" "meeting_participant_response" NOT NULL DEFAULT 'PENDING',
  "responded_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("meeting_id", "user_id"),
  CONSTRAINT "meeting_participants_response_timestamp" CHECK (("response" = 'PENDING') = ("responded_at" IS NULL))
);
ALTER TABLE "calendar_entries" ADD COLUMN "meeting_id" UUID;
ALTER TABLE "notifications" ADD COLUMN "meeting_id" UUID;
CREATE UNIQUE INDEX "calendar_entries_user_id_meeting_id_key" ON "calendar_entries"("user_id", "meeting_id");
CREATE INDEX "meetings_organizer_id_start_at_idx" ON "meetings"("organizer_id", "start_at");
CREATE INDEX "meetings_workspace_id_start_at_idx" ON "meetings"("workspace_id", "start_at");
CREATE INDEX "meetings_status_start_at_idx" ON "meetings"("status", "start_at");
CREATE INDEX "meeting_participants_user_id_response_idx" ON "meeting_participants"("user_id", "response");
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_target_at_most_one";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_at_most_one" CHECK (
  (CASE WHEN "task_id" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "message_id" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "event_id" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "meeting_id" IS NOT NULL THEN 1 ELSE 0 END) <= 1
);
ALTER TABLE "calendar_entries" DROP CONSTRAINT "calendar_entries_source_matches_type";
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_source_matches_type" CHECK (("type" = 'EVENT' AND "event_id" IS NOT NULL AND "task_id" IS NULL AND "project_id" IS NULL AND "meeting_id" IS NULL) OR ("type" = 'TASK' AND "event_id" IS NULL AND "task_id" IS NOT NULL AND "project_id" IS NULL AND "meeting_id" IS NULL) OR ("type" = 'PROJECT' AND "event_id" IS NULL AND "task_id" IS NULL AND "project_id" IS NOT NULL AND "meeting_id" IS NULL) OR ("type" = 'MEETING' AND "event_id" IS NULL AND "task_id" IS NULL AND "project_id" IS NULL AND "meeting_id" IS NOT NULL) OR ("type" IN ('PERSONAL', 'REMINDER') AND "event_id" IS NULL AND "task_id" IS NULL AND "project_id" IS NULL AND "meeting_id" IS NULL));
