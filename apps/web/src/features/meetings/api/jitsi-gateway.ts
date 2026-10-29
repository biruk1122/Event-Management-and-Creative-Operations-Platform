import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";

import { MeetingsRequestError } from "./meetings-gateway";

export type JitsiSession = components["schemas"]["MeetingJitsiSessionResponse"];

/** Fetches this meeting's self-hosted Jitsi room-join information. The
 * backend gates this independently of the meeting's own read grant - only
 * the organizer or an invited participant can get a session (see
 * `MeetingsService.getJitsiSession`). A 409 means either the meeting is
 * physical (`MEETING_NOT_ONLINE`) or Jitsi isn't configured for this
 * deployment (`MEETING_VIDEO_UNAVAILABLE`) - both are surfaced as the
 * generic conflict message below; the caller only needs to show something
 * actionable, not distinguish the two. */
export async function getJitsiSession(
  meetingId: string,
  signal?: AbortSignal,
): Promise<JitsiSession> {
  const { data, response } = await browserApi.GET(
    "/api/v1/meetings/{id}/jitsi-session",
    {
      params: { path: { id: meetingId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) {
    if (response.status === 409)
      throw new Error("Video conferencing is not available for this meeting.");
    throw new MeetingsRequestError(response.status);
  }
  return data;
}
