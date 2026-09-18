import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";

export type Meeting = components["schemas"]["MeetingResponse"];
export type MeetingsPage = components["schemas"]["PaginatedMeetingsResponse"];
/** An invitee's own answer - deliberately not named `MeetingResponse` to
 * avoid shadowing the schema's own type of that name (the full meeting
 * object `PUT /meetings/{id}/response` and `GET /meetings` both return). */
export type MeetingResponseAnswer = Extract<
  components["schemas"]["MeetingAcknowledgementResponse"]["response"],
  "ACCEPTED" | "DECLINED"
>;

const PAGE_SIZE = 25;

/** An API read or response acknowledgement that could not be recovered. */
export class MeetingsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to these meetings."
          : status === 404
            ? "That meeting is no longer available."
            : status === 409
              ? "This invitation has already been answered or the meeting is no longer scheduled."
              : "We could not update the meeting. Try again.",
    );
    this.name = "MeetingsRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

/** One page of the caller's meetings, newest-first per the API's own default
 * ordering. `useMeetings` (meetings-queries.ts) accumulates pages via
 * `useInfiniteQuery` - the "pagination/cursors" this issue's own technical
 * requirements call for, since (unlike Todo's single bounded list) a
 * long-lived account's lifetime meeting count is genuinely unbounded. */
export async function listMeetings(
  page: number,
  signal?: AbortSignal,
): Promise<MeetingsPage> {
  const { data, response } = await browserApi.GET("/api/v1/meetings", {
    // `page`/`pageSize` are modeled as an empty object in the generated
    // types because the API declares them without an explicit numeric type;
    // they are plain integers on the wire (see notifications-gateway.ts's
    // and discuss-gateway.ts's identical workaround).
    params: { query: { page, pageSize: PAGE_SIZE } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new MeetingsRequestError(response.status);
  return data;
}

export async function respondToMeeting(
  meetingId: string,
  response: MeetingResponseAnswer,
): Promise<void> {
  const { data, response: httpResponse } = await browserApi.PUT(
    "/api/v1/meetings/{id}/response",
    {
      params: { path: { id: meetingId } },
      body: { response },
      headers: headers(),
    },
  );
  if (!data) throw new MeetingsRequestError(httpResponse.status);
}
