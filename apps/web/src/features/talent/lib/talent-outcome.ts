import type { TalentFieldValues } from "./talent-form";
import type { Talent, TalentAvailability } from "./talent-types";

/** The states a profile can be created in. Mirrors the API `STARTING_AVAILABILITY` list. */
export type StartingStatus = Exclude<TalentAvailability, "ASSIGNED">;

/** The fields the create form collects: the shared fields plus an optional manager. */
export interface CreateTalentValues extends TalentFieldValues {
  managerId: string | null;
  /** Starting status, saved as availability. ASSIGNED only comes from assigning work. */
  availability: StartingStatus;
  /** The first social link, or none. Both fields are set together. */
  socialLink: TalentSocialLinkValues | null;
}

export type EditTalentValues = TalentFieldValues;

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Result of `POST /talents`. */
export type SaveTalentOutcome =
  | { status: "success"; talent: Talent }
  | { status: "manager_not_found" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof CreateTalentValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateTalent = (
  values: CreateTalentValues,
) => Promise<SaveTalentOutcome>;

/** Result of `PATCH /talents/:id`. */
export type UpdateTalentOutcome =
  | { status: "success"; talent: Talent }
  | { status: "field_errors"; fieldErrors: FieldErrors<keyof EditTalentValues> }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateTalent = (
  id: string,
  values: EditTalentValues,
) => Promise<UpdateTalentOutcome>;

/** Result of `POST /talents/:id/transition`. */
export type TransitionTalentOutcome =
  | { status: "success"; talent: Talent }
  | { status: "invalid_transition" }
  /** Archiving is blocked while the talent has active assignments. */
  | { status: "has_active_assignments" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type TransitionTalent = (
  id: string,
  availability: TalentAvailability,
) => Promise<TransitionTalentOutcome>;

/** Result of `PUT /talents/:id/manager`. */
export type SetTalentManagerOutcome =
  | { status: "success"; talent: Talent }
  | { status: "manager_not_found" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type SetTalentManager = (
  id: string,
  managerId: string | null,
) => Promise<SetTalentManagerOutcome>;

/** The fields the social-link form collects. */
export interface TalentSocialLinkValues {
  label: string;
  url: string;
}

/** Result of `POST /talents/:id/social-links`. */
export type AddSocialLinkOutcome =
  | { status: "success"; talent: Talent }
  | { status: "conflict" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof TalentSocialLinkValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AddSocialLink = (
  talentId: string,
  values: TalentSocialLinkValues,
) => Promise<AddSocialLinkOutcome>;

/** Result of `DELETE /talents/:id/social-links/:socialLinkId`. No body is returned. */
export type RemoveSocialLinkOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type RemoveSocialLink = (
  talentId: string,
  socialLinkId: string,
) => Promise<RemoveSocialLinkOutcome>;

/** The fields the schedule form collects. Dates are `datetime-local` values. */
export interface TalentScheduleValues {
  title: string;
  startAt: string;
  endAt: string;
}

/** Result of `POST` / `PATCH /talents/:id/schedules[/:scheduleId]`. */
export type SaveScheduleOutcome =
  | { status: "success"; talent: Talent }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof TalentScheduleValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type AddSchedule = (
  talentId: string,
  values: TalentScheduleValues,
) => Promise<SaveScheduleOutcome>;

export type UpdateSchedule = (
  talentId: string,
  scheduleId: string,
  values: TalentScheduleValues,
) => Promise<SaveScheduleOutcome>;

/** Result of `DELETE /talents/:id/schedules/:scheduleId`. No body is returned. */
export type RemoveScheduleOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type RemoveSchedule = (
  talentId: string,
  scheduleId: string,
) => Promise<RemoveScheduleOutcome>;

/** Loads one talent for the profile page; resolves `null` when it cannot. */
export type GetTalent = (
  id: string,
  signal?: AbortSignal,
) => Promise<Talent | null>;
