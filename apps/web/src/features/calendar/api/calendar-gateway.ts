import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  CalendarEntryFormValues,
  CreateCalendarEntry,
  CreateCalendarEntryOutcome,
  DeleteCalendarEntry,
  DeleteCalendarEntryOutcome,
  UpdateCalendarEntry,
  UpdateCalendarEntryOutcome,
} from "../lib/calendar-outcome";
import type { CalendarEntry } from "../lib/calendar-types";

/** Thrown by the read helper when the API does not return a usable body. */
export class CalendarRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to the calendar."
          : "We could not load your calendar. Try again.",
    );
    this.name = "CalendarRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

export async function listCalendarEntries(
  params: { from: string; to: string },
  signal?: AbortSignal,
): Promise<readonly CalendarEntry[]> {
  const { data, response } = await browserApi.GET("/api/v1/calendar", {
    params: { query: { from: params.from, to: params.to } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new CalendarRequestError(response.status);
  return data.items;
}

/** Build a `CreateCalendarEntryDto`: omit optional fields left blank. */
function createBody(values: CalendarEntryFormValues) {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    type: values.type,
    startAt: new Date(values.startAt).toISOString(),
    ...(description ? { description } : {}),
    ...(values.endAt ? { endAt: new Date(values.endAt).toISOString() } : {}),
  };
}

/** Build an `UpdateCalendarEntryDto`: send every field, blanking to null.
 * `type` is never sent - the update contract has no such field, matching
 * that it is immutable once an entry exists. */
function updateBody(values: CalendarEntryFormValues) {
  const description = values.description.trim();
  return {
    title: values.title.trim(),
    startAt: new Date(values.startAt).toISOString(),
    description: description === "" ? null : description,
    endAt: values.endAt ? new Date(values.endAt).toISOString() : null,
  };
}

function saveFailure(
  error: unknown,
  status: number,
): Exclude<CreateCalendarEntryOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CALENDAR_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<
        Record<keyof CalendarEntryFormValues, string>
      > = {};
      for (const key of [
        "title",
        "description",
        "type",
        "startAt",
        "endAt",
      ] as const) {
        if (fields[key]) fieldErrors[key] = fields[key];
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function updateFailure(
  error: unknown,
  status: number,
): Exclude<UpdateCalendarEntryOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CALENDAR_ENTRY_NOT_FOUND")
      return { status: "not_found" };
    if (error.code === "CALENDAR_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "VALIDATION_ERROR") {
      const fields = fieldErrorsOf(error);
      const fieldErrors: Partial<
        Record<keyof CalendarEntryFormValues, string>
      > = {};
      for (const key of ["title", "description", "startAt", "endAt"] as const) {
        if (fields[key]) fieldErrors[key] = fields[key];
      }
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function deleteFailure(
  error: unknown,
  status: number,
): Exclude<DeleteCalendarEntryOutcome, { status: "success" }> {
  if (isProblemDetails(error) && error.code === "CALENDAR_ENTRY_NOT_FOUND") {
    return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export const createCalendarEntry: CreateCalendarEntry = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/calendar",
      { body: createBody(values), headers: headers() },
    );
    return data
      ? { status: "success", entry: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateCalendarEntry: UpdateCalendarEntry = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/calendar/{id}",
      {
        params: { path: { id } },
        body: updateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", entry: data }
      : updateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteCalendarEntry: DeleteCalendarEntry = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/calendar/{id}",
      { params: { path: { id } }, headers: headers() },
    );
    if (response.ok) return { status: "success" };
    return deleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
