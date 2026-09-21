import type { CampaignFormValues } from "./campaigns-outcome";
import type { Campaign, CampaignType } from "./campaigns-types";

/**
 * What the related-subject control is set to. A campaign relates to one event,
 * one product, or nothing - never both - so the form models the choice
 * directly rather than two independent optional fields.
 */
export type SubjectKind = "NONE" | "EVENT" | "PRODUCT";

/** The campaign attributes shared by the create and edit forms. */
export interface CampaignFieldValues {
  name: string;
  campaignType: CampaignType;
  description: string;
  audience: string;
  startAt: string;
  endAt: string;
  subjectKind: SubjectKind;
  eventId: string | null;
  productName: string;
}

export type CampaignFieldErrors = Partial<
  Record<keyof CampaignFieldValues, string>
>;

export const EMPTY_FIELDS: CampaignFieldValues = {
  name: "",
  campaignType: "MARKETING",
  description: "",
  audience: "",
  startAt: "",
  endAt: "",
  subjectKind: "NONE",
  eventId: null,
  productName: "",
};

/** An ISO instant as the value a `datetime-local` input expects (no seconds, no zone). */
function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

/** The form values that describe an existing campaign. */
export function fieldsFromCampaign(campaign: Campaign): CampaignFieldValues {
  const subjectKind: SubjectKind = campaign.productName
    ? "PRODUCT"
    : campaign.eventId
      ? "EVENT"
      : "NONE";
  return {
    name: campaign.name,
    campaignType: campaign.campaignType,
    description: campaign.description ?? "",
    audience: campaign.audience ?? "",
    startAt: toLocalInput(campaign.startAt),
    endAt: toLocalInput(campaign.endAt),
    subjectKind,
    eventId: campaign.eventId,
    productName: campaign.productName ?? "",
  };
}

/** Client-side checks that mirror what the API would reject, so users get feedback first. */
export function validateFields(
  values: CampaignFieldValues,
): CampaignFieldErrors {
  const errors: CampaignFieldErrors = {};
  if (values.name.trim() === "") {
    errors.name = "Enter a name.";
  }
  if (
    values.startAt !== "" &&
    values.endAt !== "" &&
    values.endAt < values.startAt
  ) {
    errors.endAt = "The end must be on or after the start.";
  }
  if (values.subjectKind === "EVENT" && values.eventId === null) {
    errors.eventId = "Pick an event.";
  }
  if (values.subjectKind === "PRODUCT" && values.productName.trim() === "") {
    errors.productName = "Enter a product name.";
  }
  return errors;
}

/**
 * The values sent to the API: only the chosen subject survives, and the other
 * is cleared, so the pair is never ambiguous.
 */
export function toFormValues(values: CampaignFieldValues): CampaignFormValues {
  return {
    name: values.name,
    campaignType: values.campaignType,
    description: values.description,
    audience: values.audience,
    startAt: values.startAt,
    endAt: values.endAt,
    eventId: values.subjectKind === "EVENT" ? values.eventId : null,
    productName: values.subjectKind === "PRODUCT" ? values.productName : "",
  };
}
