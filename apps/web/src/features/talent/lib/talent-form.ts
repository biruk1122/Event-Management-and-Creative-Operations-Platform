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
/** Digits with an optional leading plus and common separators. Mirrors the API rule. */
export const PHONE_PATTERN = /^\+?[0-9(][0-9 ()\-.]{3,24}$/;

export const EMPTY_FIELDS: TalentFieldValues = {
  fullName: "",
  type: "ARTIST",
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
  if (values.phone.trim() !== "" && !PHONE_PATTERN.test(values.phone.trim())) {
    errors.phone = "Enter a phone number with digits, spaces or + only.";
  }
  return errors;
}

/** A social link needs both a label and a web address, or neither. */
export function validateSocialLink(link: { label: string; url: string }): {
  label?: string;
  url?: string;
} {
  const errors: { label?: string; url?: string } = {};
  const label = link.label.trim();
  const url = link.url.trim();
  if (label === "" && url === "") return errors;
  if (label === "") errors.label = "Name the link, for example Instagram.";
  if (url === "") {
    errors.url = "Enter the link address.";
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.url = "Use an http or https address.";
      }
    } catch {
      errors.url = "Enter a full address, starting with https://";
    }
  }
  return errors;
}
