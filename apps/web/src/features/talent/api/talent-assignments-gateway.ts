import type { components } from "@event-platform/api-client";

import { browserApi } from "@/lib/api/browser";
import { readCsrfToken } from "@/lib/api/csrf";
import {
  isProblemDetails,
  type ProblemDetails,
} from "@/lib/api/problem-details";

import { TalentRequestError } from "./talent-gateway";
import type {
  TalentAssignmentConflict,
  TalentAssignmentKind,
  TalentAssignmentStatus,
} from "../lib/talent-types";

export type TalentAssignment =
  components["schemas"]["TalentAssignmentResponse"];
export type TalentAssignmentCheck =
  components["schemas"]["TalentAssignmentCheckResponse"];
export type TalentWorkOption =
  components["schemas"]["TalentWorkOptionResponse"];
export type TalentActivity = components["schemas"]["TalentActivityResponse"];

/** The window and work an assignment would occupy. Dates are UTC ISO strings or null. */
export interface TalentAssignmentWindow {
  kind: TalentAssignmentKind;
  workId: string;
  startAt: string | null;
  endAt: string | null;
}

export interface TalentAssignmentDraft extends TalentAssignmentWindow {
  role: string;
  notes: string | null;
  acknowledgeConflicts: boolean;
  overrideReason: string | null;
}

export type CreateAssignmentOutcome =
  | { status: "success"; assignment: TalentAssignment }
  | { status: "conflict"; conflicts: TalentAssignmentConflict[] }
  | { status: "duplicate" }
  | { status: "inactive" }
  | { status: "work_not_found" }
  | { status: "dates_invalid" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type ChangeAssignmentOutcome =
  | { status: "success"; assignment: TalentAssignment }
  | { status: "conflict"; conflicts: TalentAssignmentConflict[] }
  | { status: "terminal" }
  | { status: "dates_invalid" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

const headers = () => {
  const token = readCsrfToken();
  return token ? { "x-csrf-token": token } : {};
};

/** Reads the conflict list the API places under `errors` on a 409. */
function conflictsOf(problem: ProblemDetails): TalentAssignmentConflict[] {
  const errors: unknown = problem.errors;
  if (!Array.isArray(errors)) return [];
  return errors.filter(
    (item): item is TalentAssignmentConflict =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { type?: unknown }).type === "string",
  );
}

function createFailure(
  error: unknown,
  status: number,
): Exclude<CreateAssignmentOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    switch (error.code) {
      case "TALENT_ASSIGNMENT_CONFLICT":
        return { status: "conflict", conflicts: conflictsOf(error) };
      case "TALENT_ASSIGNMENT_DUPLICATE":
        return { status: "duplicate" };
      case "TALENT_INACTIVE":
        return { status: "inactive" };
      case "TALENT_WORK_NOT_FOUND":
        return { status: "work_not_found" };
      case "TALENT_ASSIGNMENT_DATES_INVALID":
        return { status: "dates_invalid" };
    }
  }
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

function changeFailure(
  error: unknown,
  status: number,
): Exclude<ChangeAssignmentOutcome, { status: "success" }> {
  if (isProblemDetails(error)) {
    switch (error.code) {
      case "TALENT_ASSIGNMENT_CONFLICT":
        return { status: "conflict", conflicts: conflictsOf(error) };
      case "TALENT_ASSIGNMENT_TERMINAL":
        return { status: "terminal" };
      case "TALENT_ASSIGNMENT_DATES_INVALID":
        return { status: "dates_invalid" };
      case "TALENT_ASSIGNMENT_NOT_FOUND":
      case "TALENT_NOT_FOUND":
        return { status: "not_found" };
    }
  }
  if (status === 404) return { status: "not_found" };
  if (status === 401 || status === 403) return { status: "permission_denied" };
  return { status: "unexpected" };
}

/** Every assignment of one talent across events, productions and promotions. */
export async function listTalentAssignments(
  talentId: string,
  signal?: AbortSignal,
): Promise<TalentAssignment[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/talents/{talentId}/assignments",
    {
      params: { path: { talentId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new TalentRequestError(response.status);
  return data;
}

/** The talent's history, newest first, as the API returns it. */
export async function listTalentActivity(
  talentId: string,
  signal?: AbortSignal,
): Promise<TalentActivity[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/talents/{talentId}/activity",
    {
      params: { path: { talentId } },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new TalentRequestError(response.status);
  return data;
}

/** Works the caller may assign talent to, for the Assign dialog's work picker. */
export async function listAssignableWorks(
  kind: TalentAssignmentKind,
  search: string | null,
  signal?: AbortSignal,
): Promise<TalentWorkOption[]> {
  const { data, response } = await browserApi.GET(
    "/api/v1/talent-assignments/works",
    {
      params: {
        query: {
          kind,
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      },
      ...(signal ? { signal } : {}),
      cache: "no-store",
    },
  );
  if (!data) throw new TalentRequestError(response.status);
  return data;
}

/** Dry-run: availability, duplicates and overlaps for a window, without writing. */
export async function checkTalentAssignment(
  talentId: string,
  window: TalentAssignmentWindow,
): Promise<TalentAssignmentCheck | null> {
  const { data } = await browserApi.POST(
    "/api/v1/talents/{talentId}/assignments/check",
    {
      params: { path: { talentId } },
      body: window,
      headers: headers(),
    },
  );
  return data ?? null;
}

export async function createTalentAssignment(
  talentId: string,
  draft: TalentAssignmentDraft,
): Promise<CreateAssignmentOutcome> {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/talents/{talentId}/assignments",
    {
      params: { path: { talentId } },
      body: draft,
      headers: headers(),
    },
  );
  return data
    ? { status: "success", assignment: data }
    : createFailure(error, response.status);
}

/** An assignment made from an event's Talents tab. The same record and rules as the talent profile. */
export interface EventTalentDraft {
  talentId: string;
  role: string;
  startAt?: string | null;
  endAt?: string | null;
  notes: string | null;
  acknowledgeConflicts: boolean;
  overrideReason: string | null;
}

/** The event-side create result. Its assignment carries staff display names, never emails. */
export type EventTalentCreateOutcome =
  | Exclude<CreateAssignmentOutcome, { status: "success" }>
  | {
      status: "success";
      assignment: components["schemas"]["EventTalentAssignmentResponse"];
    };

export async function createEventTalentAssignment(
  eventId: string,
  draft: EventTalentDraft,
): Promise<EventTalentCreateOutcome> {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/events/{id}/talents",
    {
      params: { path: { id: eventId } },
      body: draft,
      headers: headers(),
    },
  );
  return data
    ? { status: "success", assignment: data }
    : createFailure(error, response.status);
}

export async function updateTalentAssignment(
  talentId: string,
  assignment: Pick<TalentAssignment, "id" | "kind">,
  values: {
    role?: string;
    notes?: string | null;
    startAt?: string | null;
    endAt?: string | null;
    acknowledgeConflicts?: boolean;
    overrideReason?: string | null;
  },
): Promise<ChangeAssignmentOutcome> {
  const { data, error, response } = await browserApi.PATCH(
    "/api/v1/talents/{talentId}/assignments/{kind}/{assignmentId}",
    {
      params: {
        path: {
          talentId,
          kind: assignment.kind,
          assignmentId: assignment.id,
        },
      },
      body: values,
      headers: headers(),
    },
  );
  return data
    ? { status: "success", assignment: data }
    : changeFailure(error, response.status);
}

/** Completes or cancels an assignment. A cancel carries the reason the API requires. */
export async function transitionTalentAssignment(
  talentId: string,
  assignment: Pick<TalentAssignment, "id" | "kind">,
  status: Exclude<TalentAssignmentStatus, "ASSIGNED">,
  reason?: string,
): Promise<ChangeAssignmentOutcome> {
  const { data, error, response } = await browserApi.POST(
    "/api/v1/talents/{talentId}/assignments/{kind}/{assignmentId}/transition",
    {
      params: {
        path: {
          talentId,
          kind: assignment.kind,
          assignmentId: assignment.id,
        },
      },
      body: { status, ...(reason ? { reason } : {}) },
      headers: headers(),
    },
  );
  return data
    ? { status: "success", assignment: data }
    : changeFailure(error, response.status);
}
