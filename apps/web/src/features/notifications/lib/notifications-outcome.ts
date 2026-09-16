import type { NotificationItem } from "./notifications-types";

/** Mirrors `PUT /api/v1/notifications/:id/read`'s stable Problem Details codes. */
export type MarkReadOutcome =
  | { status: "success"; notification: NotificationItem }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type MarkRead = (notificationId: string) => Promise<MarkReadOutcome>;

/** Mirrors `PUT`/`DELETE /api/v1/notifications/preferences/:type`. */
export type SetPreferenceOutcome =
  | { status: "success" }
  | { status: "type_invalid" }
  | { status: "type_not_mutable" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type SetPreference = (
  type: string,
  muted: boolean,
) => Promise<SetPreferenceOutcome>;
