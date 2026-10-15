import { HttpException } from "@nestjs/common";

export type MeetFailure =
  | "EXPORT_ACCOUNT_CHANGED"
  | "DISABLED"
  | "BUSY"
  | "CONSENT_INVALID"
  | "RECONNECT_REQUIRED"
  | "QUOTA"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_DENIED"
  | "INVALID_MEETING"
  | "STALE";
export class MeetError extends HttpException {
  constructor(readonly reason: MeetFailure) {
    super(
      {
        code: `GOOGLE_MEET_${reason}`,
        detail:
          "Google Calendar could not complete this action. Your Lela meeting and manual link are unchanged.",
      },
      reason === "QUOTA"
        ? 429
        : reason === "PROVIDER_UNAVAILABLE"
          ? 503
          : reason === "PROVIDER_DENIED"
            ? 403
            : 409,
    );
  }
}
