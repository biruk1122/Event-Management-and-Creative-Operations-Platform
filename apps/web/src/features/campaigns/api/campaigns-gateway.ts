import type { operations } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import { fieldErrorsOf, isProblemDetails } from "@/lib/api/problem-details";

import type {
  AssignCampaignManager,
  AssignCampaignManagerOutcome,
  AssignCampaignTeam,
  CampaignActivityValues,
  CampaignTeamOutcome,
  CreateCampaign,
  CreateCampaignActivity,
  CreateCampaignValues,
  DeleteCampaign,
  DeleteCampaignActivity,
  DeleteCampaignActivityOutcome,
  DeleteCampaignOutcome,
  EditCampaignValues,
  RemoveCampaignTeam,
  SaveCampaignActivityOutcome,
  SaveCampaignOutcome,
  SetCampaignBudget,
  SetCampaignBudgetOutcome,
  TransitionCampaign,
  TransitionCampaignOutcome,
  UpdateCampaign,
  UpdateCampaignActivity,
  UpdateCampaignOutcome,
} from "../lib/campaigns-outcome";
import type {
  AssignableEvent,
  AssignableTeam,
  AssignableUser,
  Campaign,
  CampaignActivity,
  CampaignBudget,
  CampaignStatus,
  CampaignType,
  PaginatedCampaigns,
} from "../lib/campaigns-types";

/** Thrown by the read helpers when the API does not return a usable body. */
export class CampaignsRequestError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401
        ? "Your session expired. Sign in again."
        : status === 403
          ? "You do not have access to this area."
          : status === 404
            ? "This campaign no longer exists. Refresh the list."
            : "We could not load the data. Try again.",
    );
    this.name = "CampaignsRequestError";
  }
}

function headers() {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

/** A `datetime-local` field value, read as a UTC instant. Empty stays empty. */
function toIsoUtc(local: string): string | null {
  if (local === "") return null;
  return new Date(`${local.slice(0, 16)}:00.000Z`).toISOString();
}

/** The trimmed text, or `null` when it is blank. */
function nullable(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** Build a `CreateCampaignDto`: omit optional fields that were left blank. */
function createBody(values: CreateCampaignValues) {
  const start = toIsoUtc(values.startAt);
  const end = toIsoUtc(values.endAt);
  const description = nullable(values.description);
  const audience = nullable(values.audience);
  const productName = nullable(values.productName);
  return {
    name: values.name.trim(),
    campaignType: values.campaignType,
    ...(description ? { description } : {}),
    ...(audience ? { audience } : {}),
    ...(start ? { startAt: start } : {}),
    ...(end ? { endAt: end } : {}),
    ...(values.eventId ? { eventId: values.eventId } : {}),
    ...(productName ? { productName } : {}),
    ...(values.managerId ? { managerId: values.managerId } : {}),
  };
}

/**
 * Build an `UpdateCampaignDto`: send every field, blanking a nullable one to
 * null. Sending both subject fields keeps the pair unambiguous - the one the
 * form did not choose is explicitly cleared.
 */
function updateBody(values: EditCampaignValues) {
  return {
    name: values.name.trim(),
    campaignType: values.campaignType,
    description: nullable(values.description),
    audience: nullable(values.audience),
    startAt: toIsoUtc(values.startAt),
    endAt: toIsoUtc(values.endAt),
    eventId: values.eventId,
    productName: nullable(values.productName),
  };
}

/** Build the activity create body: omit optional fields that were left blank. */
function activityCreateBody(values: CampaignActivityValues) {
  const start = toIsoUtc(values.startAt);
  const end = toIsoUtc(values.endAt);
  const description = nullable(values.description);
  return {
    name: values.name.trim(),
    status: values.status,
    ...(description ? { description } : {}),
    ...(start ? { startAt: start } : {}),
    ...(end ? { endAt: end } : {}),
  };
}

/** Build the activity update body: every field, blanking a nullable one to null. */
function activityUpdateBody(values: CampaignActivityValues) {
  return {
    name: values.name.trim(),
    description: nullable(values.description),
    status: values.status,
    startAt: toIsoUtc(values.startAt),
    endAt: toIsoUtc(values.endAt),
  };
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

const CAMPAIGN_FORM_FIELDS = [
  "name",
  "campaignType",
  "description",
  "audience",
  "startAt",
  "endAt",
  "eventId",
  "productName",
] as const;

function saveFailure(error: unknown, status: number): SaveCampaignOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "event_not_found" };
    if (error.code === "CAMPAIGN_RELATED_SUBJECT_CONFLICT")
      return { status: "subject_conflict" };
    if (error.code === "CAMPAIGN_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, [
        ...CAMPAIGN_FORM_FIELDS,
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

function updateFailure(error: unknown, status: number): UpdateCampaignOutcome {
  if (isProblemDetails(error)) {
    if (error.code === "CAMPAIGN_NOT_FOUND") return { status: "not_found" };
    if (error.code === "EVENT_NOT_FOUND") return { status: "event_not_found" };
    if (error.code === "CAMPAIGN_RELATED_SUBJECT_CONFLICT")
      return { status: "subject_conflict" };
    if (error.code === "CAMPAIGN_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, CAMPAIGN_FORM_FIELDS);
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
): Exclude<TransitionCampaignOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CAMPAIGN_INVALID_TRANSITION")
      return { status: "invalid_transition" };
    if (error.code === "CAMPAIGN_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function managerFailure(
  error: unknown,
  status: number,
): Exclude<AssignCampaignManagerOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "USER_NOT_FOUND") return { status: "manager_not_found" };
    if (error.code === "CAMPAIGN_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function teamFailure(
  error: unknown,
  status: number,
): Exclude<CampaignTeamOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CAMPAIGN_TEAM_NOT_FOUND")
      return { status: "team_not_found" };
    if (error.code === "CAMPAIGN_TEAM_NOT_ASSIGNED")
      return { status: "not_assigned" };
    if (error.code === "CAMPAIGN_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function budgetFailure(
  error: unknown,
  status: number,
): Exclude<SetCampaignBudgetOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CAMPAIGN_BUDGET_INCOMPLETE")
      return { status: "budget_incomplete" };
    if (error.code === "CAMPAIGN_NOT_FOUND") return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, [
        "amount",
        "currency",
      ] as const);
      if (fieldErrors.amount || fieldErrors.currency) {
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
): Exclude<DeleteCampaignOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CAMPAIGN_HAS_MANAGED_FILES")
      return { status: "has_managed_files" };
    if (error.code === "CAMPAIGN_NOT_FOUND") return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

const ACTIVITY_FIELDS = [
  "name",
  "description",
  "status",
  "startAt",
  "endAt",
] as const;

function activityFailure(
  error: unknown,
  status: number,
): Exclude<SaveCampaignActivityOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    if (error.code === "CAMPAIGN_ACTIVITY_SCHEDULE_INVALID")
      return { status: "schedule_invalid" };
    if (
      error.code === "CAMPAIGN_NOT_FOUND" ||
      error.code === "CAMPAIGN_ACTIVITY_NOT_FOUND"
    )
      return { status: "not_found" };
    if (error.code === "VALIDATION_ERROR") {
      const fieldErrors = pickFieldErrors(error, ACTIVITY_FIELDS);
      if (Object.keys(fieldErrors).length > 0) {
        return { status: "field_errors", fieldErrors };
      }
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function activityDeleteFailure(
  error: unknown,
  status: number,
): Exclude<DeleteCampaignActivityOutcome, { status: "success" }> {
  if (
    isProblemDetails(error) &&
    (error.code === "CAMPAIGN_NOT_FOUND" ||
      error.code === "CAMPAIGN_ACTIVITY_NOT_FOUND")
  ) {
    return { status: "not_found" };
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

export interface ListCampaignsParams {
  status?: CampaignStatus | null;
  campaignType?: CampaignType | null;
  search?: string | null;
  eventId?: string | null;
  managerId?: string | null;
  page?: number;
  pageSize?: number;
}

type ListQuery = NonNullable<
  operations["Campaigns_list_v1"]["parameters"]["query"]
>;

export async function listCampaigns(
  params: ListCampaignsParams,
  signal?: AbortSignal,
): Promise<PaginatedCampaigns> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
  };
  if (params.status) query.status = params.status;
  if (params.campaignType) query.campaignType = params.campaignType;
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.eventId) query.eventId = params.eventId;
  if (params.managerId) query.managerId = params.managerId;

  const { data, response } = await browserApi.GET("/api/v1/campaigns", {
    params: { query: query as unknown as ListQuery },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  if (!data) throw new CampaignsRequestError(response.status);
  return data;
}

/** Resolves `null` for any non-OK response so the detail dialog shows its error state. */
export async function getCampaign(
  id: string,
  signal?: AbortSignal,
): Promise<Campaign | null> {
  const { data } = await browserApi.GET("/api/v1/campaigns/{id}", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

/**
 * The campaign budget. Resolves `null` on any non-OK response - in particular a
 * 403 when the caller lacks `campaign.budget.read` - so the section can render
 * its restricted state instead of an error.
 */
export async function getCampaignBudget(
  id: string,
  signal?: AbortSignal,
): Promise<CampaignBudget | null> {
  const { data } = await browserApi.GET("/api/v1/campaigns/{id}/budget", {
    params: { path: { id } },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return data ?? null;
}

const ACTIVITY_PAGE_SIZE = 100;
/** A safety bound on the paging loop: 20 pages of 100 activities. */
const ACTIVITY_MAX_PAGES = 20;

/**
 * Every activity of one campaign, read a page at a time in the API's schedule
 * order. Resolves `null` when any page cannot be read, so the section shows its
 * error state rather than a silently truncated list.
 */
export async function listCampaignActivities(
  campaignId: string,
  signal?: AbortSignal,
): Promise<CampaignActivity[] | null> {
  const activities: CampaignActivity[] = [];
  for (let page = 1; page <= ACTIVITY_MAX_PAGES; page += 1) {
    const { data } = await browserApi.GET("/api/v1/campaigns/{id}/activities", {
      params: {
        path: { id: campaignId },
        query: { page, pageSize: ACTIVITY_PAGE_SIZE } as never,
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    });
    if (!data) return null;
    activities.push(...data.items);
    if (activities.length >= data.total || data.items.length === 0) {
      return activities;
    }
  }
  return activities;
}

/**
 * Users the manager control can offer. The campaigns API has no dedicated
 * route, so this reads the first page of `GET /api/v1/users`. Resolves `[]`
 * when the caller cannot read users.
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

/** Teams the "assign team" control can offer, from the first page of `GET /api/v1/teams`. */
export async function listAssignableTeams(
  signal?: AbortSignal,
): Promise<AssignableTeam[]> {
  const { data } = await browserApi.GET("/api/v1/teams", {
    params: { query: { pageSize: 100 } as never },
    ...(signal ? { signal } : {}),
    cache: "no-store",
  });
  return (data?.items ?? []).map((team) => ({ id: team.id, name: team.name }));
}

/** Events the "related event" control can offer, from the first page of `GET /api/v1/events`. */
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

export const createCampaign: CreateCampaign = async (values) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/campaigns",
      { body: createBody(values), headers: headers() },
    );
    return data
      ? { status: "success", campaign: data }
      : saveFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateCampaign: UpdateCampaign = async (id, values) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/campaigns/{id}",
      {
        params: { path: { id } },
        body: updateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", campaign: data }
      : updateFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const transitionCampaign: TransitionCampaign = async (id, status) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/campaigns/{id}/transition",
      { params: { path: { id } }, body: { status }, headers: headers() },
    );
    return data
      ? { status: "success", campaign: data }
      : transitionFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignCampaignManager: AssignCampaignManager = async (
  id,
  managerId,
) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/campaigns/{id}/manager",
      { params: { path: { id } }, body: { managerId }, headers: headers() },
    );
    return data
      ? { status: "success", campaign: data }
      : managerFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const assignCampaignTeam: AssignCampaignTeam = async (id, teamId) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/campaigns/{id}/teams/{teamId}",
      { params: { path: { id, teamId } }, headers: headers() },
    );
    return data
      ? { status: "success", campaign: data }
      : teamFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const removeCampaignTeam: RemoveCampaignTeam = async (id, teamId) => {
  try {
    const { data, error, response } = await browserApi.DELETE(
      "/api/v1/campaigns/{id}/teams/{teamId}",
      { params: { path: { id, teamId } }, headers: headers() },
    );
    return data
      ? { status: "success", campaign: data }
      : teamFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const setCampaignBudget: SetCampaignBudget = async (
  id,
  amount,
  currency,
) => {
  try {
    const { data, error, response } = await browserApi.PUT(
      "/api/v1/campaigns/{id}/budget",
      {
        params: { path: { id } },
        body: { amount, currency },
        headers: headers(),
      },
    );
    return data
      ? { status: "success", budget: data }
      : budgetFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteCampaign: DeleteCampaign = async (id) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/campaigns/{id}",
      { params: { path: { id } }, headers: headers() },
    );
    if (response.ok) return { status: "success" };
    return deleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const createCampaignActivity: CreateCampaignActivity = async (
  campaignId,
  values,
) => {
  try {
    const { data, error, response } = await browserApi.POST(
      "/api/v1/campaigns/{id}/activities",
      {
        params: { path: { id: campaignId } },
        body: activityCreateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", activity: data }
      : activityFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const updateCampaignActivity: UpdateCampaignActivity = async (
  campaignId,
  activityId,
  values,
) => {
  try {
    const { data, error, response } = await browserApi.PATCH(
      "/api/v1/campaigns/{id}/activities/{activityId}",
      {
        params: { path: { id: campaignId, activityId } },
        body: activityUpdateBody(values),
        headers: headers(),
      },
    );
    return data
      ? { status: "success", activity: data }
      : activityFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};

export const deleteCampaignActivity: DeleteCampaignActivity = async (
  campaignId,
  activityId,
) => {
  try {
    const { error, response } = await browserApi.DELETE(
      "/api/v1/campaigns/{id}/activities/{activityId}",
      {
        params: { path: { id: campaignId, activityId } },
        headers: headers(),
      },
    );
    if (response.ok) return { status: "success" };
    return activityDeleteFailure(error, response.status);
  } catch {
    return { status: "unexpected" };
  }
};
