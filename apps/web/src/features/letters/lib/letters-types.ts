import type { components } from "@event-platform/api-client";

export type Letter = components["schemas"]["LetterResponse"];
export type PaginatedLetters =
  components["schemas"]["PaginatedLettersResponse"];
export type LetterRemark = components["schemas"]["LetterRemarkResponse"];
export type LetterOptions = components["schemas"]["LetterOptionsResponse"];
export type LetterDirection = Letter["direction"];
export type LetterCategory = Letter["category"];

export const LETTER_DIRECTIONS: readonly LetterDirection[] = [
  "INCOMING",
  "OUTGOING",
];

export const LETTER_DIRECTION_LABELS: Record<LetterDirection, string> = {
  INCOMING: "Incoming",
  OUTGOING: "Outgoing",
};

export const LETTER_CATEGORY_LABELS: Record<LetterCategory, string> = {
  CAST: "Casting",
  PROD: "Production",
  MKT: "Marketing",
  PROMO: "Promotion",
  EOM: "Event & Office Management",
  HR: "HR & Executive Officer",
  OTHER: "Other",
};

export function letterPartyLabel(letter: Pick<Letter, "direction">): string {
  return letter.direction === "INCOMING" ? "From" : "To";
}

export function letterParty(
  letter: Pick<Letter, "direction" | "fromParty" | "toParty">,
): string | null {
  return letter.direction === "INCOMING" ? letter.fromParty : letter.toParty;
}
