import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  AddSchedule,
  AddSocialLink,
  AddSocialLinkOutcome,
  AssignEvent,
  AssignEventOutcome,
  CreateTalent,
  CreateTalentValues,
  EditTalentValues,
  GetTalent,
  RemoveSchedule,
  RemoveScheduleOutcome,
  RemoveSocialLink,
  RemoveSocialLinkOutcome,
  SaveScheduleOutcome,
  SaveTalentOutcome,
  SetTalentManager,
  SetTalentManagerOutcome,
  TransitionAssignment,
  TransitionAssignmentOutcome,
  TransitionTalent,
  TransitionTalentOutcome,
  UpdateSchedule,
  UpdateTalent,
  UpdateTalentOutcome,
} from "../lib/talent-outcome";
import type {
  AssignableEvent,
  AssignableUser,
  PaginatedTalents,
  TalentAvailability,
  TalentType,
} from "../lib/talent-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class TalentRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This talent no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "TalentRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

/** A `datetime-local` field value, read as a UTC instant. */
function toIsoUtc(local: string): string {
  return new Date(`${local.slice(0, 16)}:00.000Z`).toISOString();
}

/** The trimmed text, or `null` when it is blank. */
function nullable(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

function pickFieldErrors<K extends string>(
  error: unknown,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const fields = isProblemDetails(error) ? fieldErrorsOf(error) : {};
  const picked: Partial<Record<K, string>> = {};
  for (const key of keys) {
    if (fields[key]) picked[key] = fields[key];
  }
  return picked;
}

/** Build a `CreateTalentDto`: omit optional fields that were left blank. */
function createBody(values: CreateTalentValues) {
  const email = nullable(values.email);
  const phone = nullable(values.phone);
  const biography = nullable(values.biography);
  return {
    fullName: values.fullName.trim(),
    type: values.type,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(biography ? { biography } : {}),
    ...(values.managerId ? { managerId: values.managerId } : {}),
  };
}

/** Build an `UpdateTalentDto`: send every field, blanking a nullable one to null. */
function updateBody(values: EditTalentValues) {
  return {
    fullName: values.fullName.trim(),
    type: values.type,
    email: nullable(values.email),
    phone: nullable(values.phone),
    biography: nullable(values.biography),
  };
}

const TALENT_FORM_FIELDS = [
  "fullName",
  "type",
  "email",
  "phone",
  "biography",
] as const;

function saveFailure(error: unknown, status: number): SaveTalentOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, [
        ...TALENT_FORM_FIELDS,
        "managerId",
      ] as const);
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function updateFailure(error: unknown, status: number): UpdateTalentOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "TALENT_NOT_FOUND") return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, TALENT_FORM_FIELDS);
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function transitionFailure(
  error: unknown,
  status: number,
): Exclude<TransitionTalentOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TALENT_AVAILABILITY_TRANSITION_INVALID")
      return { status: "invalid_transition" };
    if (error.code === "TALENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function managerFailure(
  error: unknown,
  status: number,
): Exclude<SetTalentManagerOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "TALENT_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function socialLinkFailure(
  error: unknown,
  status: number,
): Exclude<AddSocialLinkOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TALENT_SOCIAL_LINK_CONFLICT")
      return { status: "conflict" };
    if (error.code === "TALENT_NOT_FOUND") return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, ["label", "url"] as const);
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function removeSocialLinkFailure(
  error: unknown,
  status: number,
): Exclude<RemoveSocialLinkOutcome, { status: "success" }> {
  if (
    isProblemDetails(error) &&
    (error.code === "TALENT_NOT_FOUND" ||
      error.code === "TALENT_SOCIAL_LINK_NOT_FOUND")
  ) {
    return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function scheduleFailure(
  error: unknown,
  status: number,
): Exclude<SaveScheduleOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TALENT_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (
      error.code === "TALENT_NOT_FOUND" ||
      error.code === "TALENT_SCHEDULE_NOT_FOUND"
    )
      return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, [
        "title",
        "startAt",
        "endAt",
      ] as const);
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function removeScheduleFailure(
  error: unknown,
  status: number,
): Exclude<RemoveScheduleOutcome, { status: "success" }> {
  if (
    isProblemDetails(error) &&
    (error.code === "TALENT_NOT_FOUND" ||
      error.code === "TALENT_SCHEDULE_NOT_FOUND")
  ) {
    return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function assignFailure(
  error: unknown,
  status: number,
): Exclude<AssignEventOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TALENT_EVENT_ASSIGNMENT_CONFLICT")
      return { status: "conflict" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "event_not_found" };
    if (error.code === "TALENT_NOT_FOUND") return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, ["eventId", "role"] as const);
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function assignmentTransitionFailure(
  error: unknown,
  status: number,
): Exclude<TransitionAssignmentOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "TALENT_ASSIGNMENT_TRANSITION_INVALID")
      return { status: "invalid_transition" };
    if (
      error.code === "TALENT_NOT_FOUND" ||
      error.code === "TALENT_ASSIGNMENT_NOT_FOUND"
    )
      return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListTalentsParams {
  type?: TalentType | null;
  availability?: TalentAvailability | null;
  managerId?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Talent_list_v1"]["parameters"]["query"]
>;

export async function listTalents(
  params: ListTalentsParams,
  signal?: AbortSignal,
): Promise<PaginatedTalents> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.type) query.type = params.type;
  if (params.availability) query.availability = params.availability;
  if (params.managerId) query.managerId = params.managerId;
  if (params.search?.trim()) query.search = params.search.trim();

  const { data, response } = await browserApi.GET("/api/v1/talents", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new TalentRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog shows its error state. */
export const getTalent: GetTalent = async (id, signal?: AbortSignal) => {
  const { data } = await browserApi.GET("/api/v1/talents/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
};

/**
 * Users the manager and role-assignment controls can offer. The talent API
 * has no dedicated route, so this reads the first page of `GET /api/v1/users`.
 * Resolves `[]` when the caller cannot read users.
 */
export async function listAssignableUsers(
  signal?: AbortSignal,
): Promise<AssignableUser[]> {
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

/** Events the assignment control can offer, from the first page of `GET /api/v1/events`. */
export async function listAssignableEvents(
  signal?: AbortSignal,
): Promise<AssignableEvent[]> {
  const { data } = await browserApi.GET("/api/v1/events", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((event) => ({
    id: event.id,
    name: event.name,
  }));
}

export const createTalent: CreateTalent = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST("/api/v1/talents", {
      body: createBody(values),
      headers: headers(),
    });
    return data
      ? { status: "success", talent: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateTalent: UpdateTalent = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/talents/{id}",
      {
        params: { path: { id } },
        // UpdateTalentDto's generated type omits `| null` on its nullable
        // fields (PartialType only adds `?`, unlike Projects' hand-written
        // nullable update DTO) even though the API accepts an explicit null
        // to clear a field. See the matching workaround in meetings-gateway.ts.
        body: updateBody(values) as never,
        headers: headers(),
      },
    );
    return data
      ? { status: "success", talent: data }
      : updateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const transitionTalent: TransitionTalent = async (id, availability) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/talents/{id}/transition",
      { params: { path: { id } }, body: { availability }, headers: headers() },
    );
    return data
      ? { status: "success", talent: data }
      : transitionFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const setTalentManager: SetTalentManager = async (id, managerId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/talents/{id}/manager",
      {
        params: { path: { id } },
        // SetTalentManagerDto's generated `managerId` type is an untyped
        // `Object | null` rather than `string | null` (the Swagger decorator
        // omits an explicit `type`), so the literal body needs the same
        // workaround as the page/pageSize query params.
        body: { managerId } as never,
        headers: headers(),
      },
    );
    return data
      ? { status: "success", talent: data }
      : managerFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const addSocialLink: AddSocialLink = async (talentId, values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/talents/{id}/social-links",
      {
        params: { path: { id: talentId } },
        body: { label: values.label.trim(), url: values.url.trim() },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", talent: data }
      : socialLinkFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeSocialLink: RemoveSocialLink = async (
  talentId,
  socialLinkId,
) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/talents/{id}/social-links/{socialLinkId}",
      { params: { path: { id: talentId, socialLinkId } }, headers: headers() },
    );
    if (response.ok) return { status: "success" };
    return removeSocialLinkFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const addSchedule: AddSchedule = async (talentId, values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/talents/{id}/schedules",
      {
        params: { path: { id: talentId } },
        body: {
          title: values.title.trim(),
          startAt: toIsoUtc(values.startAt),
          endAt: toIsoUtc(values.endAt),
        },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", talent: data }
      : scheduleFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateSchedule: UpdateSchedule = async (
  talentId,
  scheduleId,
  values,
) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/talents/{id}/schedules/{scheduleId}",
      {
        params: { path: { id: talentId, scheduleId } },
        body: {
          title: values.title.trim(),
          startAt: toIsoUtc(values.startAt),
          endAt: toIsoUtc(values.endAt),
        },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", talent: data }
      : scheduleFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeSchedule: RemoveSchedule = async (talentId, scheduleId) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/talents/{id}/schedules/{scheduleId}",
      { params: { path: { id: talentId, scheduleId } }, headers: headers() },
    );
    if (response.ok) return { status: "success" };
    return removeScheduleFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignEvent: AssignEvent = async (talentId, values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/talents/{id}/event-assignments",
      {
        params: { path: { id: talentId } },
        body: { eventId: values.eventId, role: values.role.trim() },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", talent: data }
      : assignFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const transitionAssignment: TransitionAssignment = async (
  talentId,
  assignmentId,
  status,
) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/talents/{id}/event-assignments/{assignmentId}/transition",
      {
        params: { path: { id: talentId, assignmentId } },
        body: { status },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", talent: data }
      : assignmentTransitionFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
