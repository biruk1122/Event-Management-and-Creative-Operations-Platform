import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";

export type Meeting = components["schemas"]["MeetingResponse"];
export type MeetingsPage = components["schemas"]["PaginatedMeetingsResponse"];
export type CreateMeetingInput = components["schemas"]["CreateMeetingDto"];
export type UpdateMeetingInput = components["schemas"]["UpdateMeetingDto"];

export async function removeMeeting(id: string): Promise<void> {
  const { response } = await browserApi.DELETE("/api/v1/meetings/{id}", {
    params: { path: { id } },
    headers: headers(),
  });
  if (!response.ok) throw new MeetingsRequestError(response.status);
}

export async function updateMeeting(
  id: string,
  input: UpdateMeetingInput,
): Promise<Meeting> {
  const { data, response } = await browserApi.PATCH("/api/v1/meetings/{id}", {
    params: { path: { id } },
    body: input,
    headers: headers(),
  });
  if (!data) {
    if (response.status === 400)
      throw new Error("Check the meeting dates and location, then try again.");
    if (response.status === 409)
      throw new Error(
        "This meeting was cancelled and can no longer be edited. Refresh the list.",
      );
    throw new MeetingsRequestError(response.status);
  }
  return data;
}

export interface AssignableMeetingPerson {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** The full user directory, for the create-meeting participant picker.
 * Requires `user.read` at ORGANIZATION scope (Super Admin only, per the
 * permission catalog) - a Department Manager cannot browse it, same
 * constraint productions' own "Add member" picker already has. The caller
 * gates on that grant and shows an explanatory message instead when it's
 * absent, rather than calling this and handling a 403. */
export async function listAssignablePeople(
  signal?: AbortSignal,
): Promise<AssignableMeetingPerson[]> {
  const { data } = await browserApi.GET("/api/v1/users", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((user) => ({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  }));
}

export async function getMeeting(
  id: string,
  signal?: AbortSignal,
): Promise<Meeting> {
  const { data, response } = await browserApi.GET("/api/v1/meetings/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new MeetingsRequestError(response.status);
  return data;
}

export async function createMeeting(
  input: CreateMeetingInput,
): Promise<Meeting> {
  const { data, response } = await browserApi.POST("/api/v1/meetings", {
    body: input,
    headers: headers(),
  });
  if (!data) {
    if (response.status === 400)
      throw new Error("Check the meeting dates and venue, then try again.");
    throw new MeetingsRequestError(response.status);
  }
  return data;
}
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

/** Records or edits a meeting's minutes, as its organizer (EOM-01). */
export async function setMeetingMinutes(
  meetingId: string,
  minutes: string,
): Promise<Meeting> {
  const { data, response } = await browserApi.PUT(
    "/api/v1/meetings/{id}/minutes",
    {
      params: { path: { id: meetingId } },
      body: { minutes },
      headers: headers(),
    },
  );
  if (!data) throw new MeetingsRequestError(response.status);
  return data;
}

/** Completes or cancels a scheduled meeting, as its organizer - used by the
 * in-app Jitsi room's organizer-only "End meeting for everyone" control
 * (a Lela-side state change, not a Jitsi moderation action). */
export async function transitionMeeting(
  meetingId: string,
  status: "COMPLETED" | "CANCELLED",
): Promise<Meeting> {
  const { data, response } = await browserApi.POST(
    "/api/v1/meetings/{id}/transition",
    {
      params: { path: { id: meetingId } },
      body: { status },
      headers: headers(),
    },
  );
  if (!data) throw new MeetingsRequestError(response.status);
  return data;
}

export interface CreateActionItemInput {
  title: string;
  assigneeId?: string;
}

/** Creates a `Task` linked back to this meeting via `sourceMeetingId`, as its
 * organizer (EOM-01) - the task's department is resolved server-side.
 * `priority` is sent explicitly because the generated client - following the
 * DTO's `@default` annotation - types it as required, even though the API
 * itself treats it as optional. */
export async function createMeetingActionItem(
  meetingId: string,
  input: CreateActionItemInput,
): Promise<void> {
  const { data, response } = await browserApi.POST(
    "/api/v1/meetings/{id}/action-items",
    {
      params: { path: { id: meetingId } },
      body: { priority: "MEDIUM", ...input },
      headers: headers(),
    },
  );
  if (!data) throw new MeetingsRequestError(response.status);
}
