-- Meeting SMS categories (Phase 3). Additive only.
ALTER TYPE "sms_category" ADD VALUE 'MEETING_INVITATION';
ALTER TYPE "sms_category" ADD VALUE 'MEETING_CHANGED';
ALTER TYPE "sms_category" ADD VALUE 'MEETING_REMINDER';
ALTER TYPE "sms_category" ADD VALUE 'MEETING_CANCELLED';
