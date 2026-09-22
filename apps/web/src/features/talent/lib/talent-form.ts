import type { Talent, TalentType } from "./talent-types";

/** The profile attributes shared by the create and edit forms. */
export interface TalentFieldValues {
  fullName: string;
  type: TalentType;
  email: string;
  phone: string;
  biography: string;
}

export type TalentFieldErrors = Partial<
  Record<keyof TalentFieldValues, string>
>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMPTY_FIELDS: TalentFieldValues = {
  fullName: "",
  type: "MUSICIAN",
  email: "",
  phone: "",
  biography: "",
};

/** The form values that describe an existing talent profile. */
export function fieldsFromTalent(talent: Talent): TalentFieldValues {
  return {
    fullName: talent.fullName,
    type: talent.type,
    email: talent.email ?? "",
    phone: talent.phone ?? "",
    biography: talent.biography ?? "",
  };
}

/** Client-side checks that mirror what the API would reject, so users get feedback first. */
export function validateFields(values: TalentFieldValues): TalentFieldErrors {
  const errors: TalentFieldErrors = {};
  if (values.fullName.trim() === "") {
    errors.fullName = "Enter a name.";
  }
  if (values.email.trim() !== "" && !EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}
