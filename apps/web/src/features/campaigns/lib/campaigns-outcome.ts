import type {
  Campaign,
  CampaignActivity,
  CampaignActivityStatus,
  CampaignBudget,
  CampaignStatus,
  CampaignType,
} from "./campaigns-types";

/**
 * The fields the create and edit forms collect. Optional text fields are empty
 * strings. `eventId` and `productName` are mutually exclusive: the form only
 * ever sends one of them, and the other is `null` / an empty string.
 */
export interface CampaignFormValues {
  name: string;
  campaignType: CampaignType;
  description: string;
  audience: string;
  startAt: string;
  endAt: string;
  eventId: string | null;
  productName: string;
}

/** The fields the create form collects: the shared fields plus an optional manager. */
export interface CreateCampaignValues extends CampaignFormValues {
  managerId: string | null;
}

export type EditCampaignValues = CampaignFormValues;

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/**
 * Result of a create attempt, in UI terms. CAM-05 maps the real
 * `POST /campaigns` Problem Details codes onto these cases; the form only needs
 * to know which state to present.
 */
export type SaveCampaignOutcome =
  | { status: "success"; campaign: Campaign }
  | { status: "manager_not_found" }
  | { status: "event_not_found" }
  | { status: "subject_conflict" }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof CreateCampaignValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateCampaign = (
  values: CreateCampaignValues,
) => Promise<SaveCampaignOutcome>;

/** Result of `PATCH /campaigns/:id`. */
export type UpdateCampaignOutcome =
  | { status: "success"; campaign: Campaign }
  | { status: "event_not_found" }
  | { status: "subject_conflict" }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof EditCampaignValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateCampaign = (
  id: string,
  values: EditCampaignValues,
) => Promise<UpdateCampaignOutcome>;

/** Result of `POST /campaigns/:id/transition`. */
export type TransitionCampaignOutcome =
  | { status: "success"; campaign: Campaign }
  | { status: "invalid_transition" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type TransitionCampaign = (
  id: string,
  status: CampaignStatus,
) => Promise<TransitionCampaignOutcome>;

/** Result of `PUT /campaigns/:id/manager`. */
export type AssignCampaignManagerOutcome =
  | { status: "success"; campaign: Campaign }
  | { status: "manager_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignCampaignManager = (
  id: string,
  managerId: string | null,
) => Promise<AssignCampaignManagerOutcome>;

/** Result of `PUT` / `DELETE /campaigns/:id/teams/:teamId`. */
export type CampaignTeamOutcome =
  | { status: "success"; campaign: Campaign }
  | { status: "team_not_found" }
  | { status: "not_assigned" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AssignCampaignTeam = (
  id: string,
  teamId: string,
) => Promise<CampaignTeamOutcome>;

export type RemoveCampaignTeam = (
  id: string,
  teamId: string,
) => Promise<CampaignTeamOutcome>;

/** Result of `PUT /campaigns/:id/budget`. `permission_denied` covers a missing budget key. */
export type SetCampaignBudgetOutcome =
  | { status: "success"; budget: CampaignBudget }
  | { status: "budget_incomplete" }
  | {
      status: "field_errors";
      fieldErrors: { amount?: string; currency?: string };
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type SetCampaignBudget = (
  id: string,
  amount: number | null,
  currency: string | null,
) => Promise<SetCampaignBudgetOutcome>;

/** Result of `DELETE /campaigns/:id`. */
export type DeleteCampaignOutcome =
  | { status: "success" }
  | { status: "has_managed_files" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteCampaign = (id: string) => Promise<DeleteCampaignOutcome>;

/** Loads one campaign for the detail dialog; resolves `null` when it cannot. */
export type GetCampaign = (id: string) => Promise<Campaign | null>;

/**
 * Loads the budget for one campaign. Resolves `null` when the caller may not
 * read it (CAM-05 maps a 403 here) so the section can render a "restricted"
 * state.
 */
export type GetCampaignBudget = (id: string) => Promise<CampaignBudget | null>;

/** The fields the activity form collects. Optional text fields are empty strings. */
export interface CampaignActivityValues {
  name: string;
  description: string;
  status: CampaignActivityStatus;
  startAt: string;
  endAt: string;
}

/** Result of `POST` / `PATCH /campaigns/:id/activities[/:activityId]`. */
export type SaveCampaignActivityOutcome =
  | { status: "success"; activity: CampaignActivity }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof CampaignActivityValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateCampaignActivity = (
  campaignId: string,
  values: CampaignActivityValues,
) => Promise<SaveCampaignActivityOutcome>;

export type UpdateCampaignActivity = (
  campaignId: string,
  activityId: string,
  values: CampaignActivityValues,
) => Promise<SaveCampaignActivityOutcome>;

/** Result of `DELETE /campaigns/:id/activities/:activityId`. */
export type DeleteCampaignActivityOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteCampaignActivity = (
  campaignId: string,
  activityId: string,
) => Promise<DeleteCampaignActivityOutcome>;

/**
 * Loads every activity of one campaign for the detail dialog; resolves `null`
 * when they cannot be loaded.
 */
export type ListCampaignActivities = (
  campaignId: string,
) => Promise<CampaignActivity[] | null>;
