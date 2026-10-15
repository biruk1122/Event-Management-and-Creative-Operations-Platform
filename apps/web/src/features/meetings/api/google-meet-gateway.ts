import type { components } from "@event-platform/api-client";
import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";

export type MeetStatus = components["schemas"]["MeetStatusResponse"];
const headers = () => ({ "x-csrf-token": readCsrfToken() ?? "" });
export class MeetRequestError extends Error {
  constructor(status: number) {
    super(
      status === 403
        ? "Only the authorized meeting organizer can manage this connection."
        : status === 429
          ? "The safe Google request limit was reached. Use a manual link or try later."
          : "Google could not complete this action. Your meeting and manual link are still available. Refresh the status or reconnect.",
    );
  }
}
export async function meetStatus(id: string): Promise<MeetStatus> {
  const { data, response } = await browserApi.GET(
    "/api/v1/meetings/{id}/google-meet",
    { params: { path: { id } }, cache: "no-store" },
  );
  if (!data) throw new MeetRequestError(response.status);
  return data;
}
export async function authorizeGoogle(): Promise<string> {
  const { data, response } = await browserApi.POST(
    "/api/v1/meetings/google-calendar/authorize",
    { headers: headers() },
  );
  if (!data) throw new MeetRequestError(response.status);
  return data.url;
}
export async function syncGoogle(id: string) {
  const { data, response } = await browserApi.POST(
    "/api/v1/meetings/{id}/google-meet",
    { params: { path: { id } }, headers: headers() },
  );
  if (!data) throw new MeetRequestError(response.status);
  return data;
}
export async function cleanupGoogle(id: string) {
  const { data, response } = await browserApi.DELETE(
    "/api/v1/meetings/{id}/google-meet",
    { params: { path: { id } }, headers: headers() },
  );
  if (!data) throw new MeetRequestError(response.status);
  return data;
}
export async function disconnectGoogle() {
  const { data, response } = await browserApi.DELETE(
    "/api/v1/meetings/google-calendar/connection",
    { headers: headers() },
  );
  if (!data) throw new MeetRequestError(response.status);
  return data;
}
export async function saveManualMeetingLink(id: string, onlineLink: string) {
  const { data, response } = await browserApi.PATCH("/api/v1/meetings/{id}", {
    params: { path: { id } },
    body: { onlineLink },
    headers: headers(),
  });
  if (!data) throw new MeetRequestError(response.status);
  return data;
}
