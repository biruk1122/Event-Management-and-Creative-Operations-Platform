import type { Partner, PartnerActivity, PartnerStatus } from "./partners-types";

/** The fields the create and edit forms collect. */
export interface PartnerFieldValues {
  organizationName: string;
  category: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  proposedContribution: string;
  notes: string;
  followUpAt: string;
}

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Result of `POST /partners`. */
export type CreatePartnerOutcome =
  | { status: "success"; partner: Partner }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof PartnerFieldValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreatePartner = (
  values: PartnerFieldValues,
) => Promise<CreatePartnerOutcome>;

/** Result of `PATCH /partners/:id`. */
export type UpdatePartnerOutcome =
  | { status: "success"; partner: Partner }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof PartnerFieldValues>;
    }
  | { status: "owner_outside_department" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdatePartner = (
  id: string,
  values: Partial<PartnerFieldValues> & {
    status?: PartnerStatus;
    ownerId?: string | null;
  },
) => Promise<UpdatePartnerOutcome>;

/** Loads one partner for the detail dialog; resolves `null` when it cannot. */
export type GetPartner = (id: string) => Promise<Partner | null>;

/** Result of `POST /partners/:id/activities`. */
export type CreatePartnerActivityOutcome =
  | { status: "success"; activity: PartnerActivity }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreatePartnerActivity = (
  id: string,
  note: string,
) => Promise<CreatePartnerActivityOutcome>;
