import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";

import type { MarkRead, SetPreference } from "../lib/notifications-outcome";
import type {
  NotificationPreference,
  PaginatedNotifications,
} from "../lib/notifications-types";

/** A usable error for read failures, including a scope or session change. */
export class NotificationsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to notifications."
          : "We could not load your notifications. Try again.",
    );
    this.name = "NotificationsRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function isPermissionDenied(code: string): boolean {
  return (
    code === "PERMISSION_DENIED" ||
    code === "CSRF_TOKEN_INVALID" ||
    code === "AUTH_UNAUTHENTICATED"
  );
}

type ListQuery = NonNullable<
  operations["Notifications_list_v1"]["parameters"]["query"]
>;

export async function listNotifications(
  params: { cursor?: string; limit?: number },
  signal?: AbortSignal,
): Promise<PaginatedNotifications> {
  const query: Record<string, string | number> = { limit: params.limit ?? 25 };
  if (params.cursor) query.cursor = params.cursor;

  const { data, response } = await browserApi.GET("/api/v1/notifications", {
    // `limit` is modeled as an empty object in the generated types because
    // the API declares it without an explicit numeric type; it is a plain
    // integer on the wire (see discuss-gateway.ts's identical workaround).
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new NotificationsRequestError(response.status);
  return data;
}

export async function unreadCount(signal?: AbortSignal): Promise<number> {
  const { data, response } = await browserApi.GET(
    "/api/v1/notifications/unread-count",
    { ...(signal ? { signal } : {}), cache: "no-store" },
  );
  if (!data) throw new NotificationsRequestError(response.status);
  return data.unreadCount;
}

export async function listPreferences(
  signal?: AbortSignal,
): Promise<readonly NotificationPreference[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/notifications/preferences",
    { ...(signal ? { signal } : {}), cache: "no-store" },
  );
  if (!data) throw new NotificationsRequestError(response.status);
  return data.items;
}

function markReadFailure(
  error: unknown,
  status: number,
): Exclude<Awaited<ReturnType<MarkRead>>, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "NOTIFICATION_NOT_FOUND") return { status: "not_found" };
    if (isPermissionDenied(error.code)) return { status: "permission_denied" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const markRead: MarkRead = async (notificationId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/notifications/{id}/read",
      { params: { path: { id: notificationId } }, headers: headers() },
    );
    return data
      ? { status: "success", notification: data }
      : markReadFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

function setPreferenceFailure(
  error: unknown,
  status: number,
): Exclude<Awaited<ReturnType<SetPreference>>, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "NOTIFICATION_TYPE_INVALID")
      return { status: "type_invalid" };
    if (error.code === "NOTIFICATION_TYPE_NOT_MUTABLE")
      return { status: "type_not_mutable" };
    if (isPermissionDenied(error.code)) return { status: "permission_denied" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const setPreference: SetPreference = async (type, muted) => {
  try {
    const { error, response } = muted
      ? await browserApi.PUT("/api/v1/notifications/preferences/{type}", {
          params: { path: { type } },
          headers: headers(),
        })
      : await browserApi.DELETE("/api/v1/notifications/preferences/{type}", {
          params: { path: { type } },
          headers: headers(),
        });
    return response.ok
      ? { status: "success" }
      : setPreferenceFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
