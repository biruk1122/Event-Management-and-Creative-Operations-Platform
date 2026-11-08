import type { components } from "@event-platform/api-client";
import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { isProblemDetails } from "@/lib/api/problem-details";

export type SmsSettings = components["schemas"]["SmsSettingsResponse"];
export type SmsMessageList =
  components["schemas"]["PaginatedSmsMessagesResponse"];
export type SmsMessageItem = components["schemas"]["SmsMessageResponse"];
export type SmsMessageDetail =
  components["schemas"]["SmsMessageDetailResponse"];
export type SmsConnectionTest =
  components["schemas"]["SmsConnectionTestResponse"];
export type SmsRecipient = components["schemas"]["SmsRecipientResponse"];
export type SmsResolutionDecision = "CANCEL" | "REQUEUE";

export interface SmsHistoryFilters {
  status?: string;
  category?: string;
  recipientUserId?: string;
  /** ISO instants, converted from the form's dates before sending. */
  createdFrom?: string;
  createdTo?: string;
  page: number;
  pageSize: number;
}

const MESSAGES: Record<number, string> = {
  400: "Check the filters and try again.",
  401: "Your session expired. Sign in again.",
  403: "You do not have access to this area.",
  404: "That SMS message no longer exists.",
  409: "This message can no longer be resolved. Reload it to see its current status.",
  429: "Too many requests. Wait a moment and try again.",
};

/** Thrown for a failed request. Every message is fixed text, so no provider content can appear in it. */
export class SmsRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(
      code === "SMS_MESSAGE_NOT_RESOLVABLE"
        ? "This message can no longer be resolved. Reload it to see its current status."
        : code === "SMS_SETTINGS_INVALID"
          ? "Those settings were not accepted. Reload and try again."
          : (MESSAGES[status] ??
            "We could not load SMS information. Try again."),
    );
  }
}

function csrfHeaders(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

function codeOf(error: unknown): string | undefined {
  return isProblemDetails(error) ? error.code : undefined;
}

export async function getSmsSettings(
  signal?: AbortSignal,
): Promise<SmsSettings> {
  const { data, response } = await browserApi.GET("/api/v1/sms/settings", {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!data) throw new SmsRequestError(response.status);
  return data;
}

export async function updateSmsSettings(input: {
  globalEnabled?: boolean;
  categories?: Record<string, boolean>;
}): Promise<SmsSettings> {
  const { data, error, response } = await browserApi.PATCH(
    "/api/v1/sms/settings",
    { body: input, headers: csrfHeaders() },
  );
  if (!data) throw new SmsRequestError(response.status, codeOf(error));
  return data;
}

export async function listSmsMessages(
  filters: SmsHistoryFilters,
  signal?: AbortSignal,
): Promise<SmsMessageList> {
  const { data, response } = await browserApi.GET("/api/v1/sms/messages", {
    params: {
      query: {
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.category ? { category: filters.category as never } : {}),
        ...(filters.recipientUserId
          ? { recipientUserId: filters.recipientUserId }
          : {}),
        ...(filters.createdFrom ? { createdFrom: filters.createdFrom } : {}),
        ...(filters.createdTo ? { createdTo: filters.createdTo } : {}),
        page: filters.page,
        pageSize: filters.pageSize,
      },
    },
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!data) throw new SmsRequestError(response.status);
  return data;
}

export async function getSmsMessage(
  id: string,
  signal?: AbortSignal,
): Promise<SmsMessageDetail> {
  const { data, response } = await browserApi.GET("/api/v1/sms/messages/{id}", {
    params: { path: { id } },
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!data) throw new SmsRequestError(response.status);
  return data;
}

/** Resolves an uncertain message. The server only allows this for UNCERTAIN messages. */
export async function resolveSmsMessage(
  id: string,
  decision: SmsResolutionDecision,
): Promise<void> {
  const { error, response } = await browserApi.POST(
    "/api/v1/sms/messages/{id}/resolve",
    {
      params: { path: { id } },
      body: { decision },
      headers: csrfHeaders(),
    },
  );
  if (!response.ok) throw new SmsRequestError(response.status, codeOf(error));
}

/** Finds users by name fragment or user id. Returns names and ids only. */
export async function searchSmsRecipients(
  query: string,
  signal?: AbortSignal,
): Promise<SmsRecipient[]> {
  const { data, response } = await browserApi.GET("/api/v1/sms/recipients", {
    params: { query: { q: query } },
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!data) throw new SmsRequestError(response.status);
  return data.items;
}

/** Reads the provider balance. Sends no SMS. */
export async function testSmsConnection(): Promise<SmsConnectionTest> {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/sms/test-connection",
    { headers: csrfHeaders() },
  );
  if (!data) throw new SmsRequestError(response.status, codeOf(error));
  return data;
}
