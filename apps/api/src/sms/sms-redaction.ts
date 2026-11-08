/**
 * Structured sanitization for SMS text that leaves the API. Values are kept only
 * when they match a strict format. Anything that does not match is withheld, so
 * the default is to hide rather than to try to find and mask a secret.
 *
 * Provider `message` and `description` fields are free text, so they are never
 * returned at all. Only the short acknowledgement and status tokens are kept.
 */

/** Short, plain text: letters, digits and simple punctuation. No `+`, `@`, URLs, or long digit runs. */
const SAFE_TEXT = /^[A-Za-z][A-Za-z0-9 ().,_'-]{0,159}$/;
/** A run of seven or more digits can be a phone number, an account number or a token. */
const LONG_DIGITS = /\d{7,}/;
/** Anything that looks like a URL, an address or an identifier with a scheme. */
const LOOKS_SENSITIVE =
  /@|:\/\/|\+|\bbearer\b|\btoken\b|\bkey\b|\bsecret\b|\bpassword\b/i;

export const WITHHELD = "Details withheld";

/** Returns the text when it is safe to show, otherwise a fixed placeholder. */
export function safeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (
    !SAFE_TEXT.test(trimmed) ||
    LONG_DIGITS.test(trimmed) ||
    LOOKS_SENSITIVE.test(trimmed)
  ) {
    return WITHHELD;
  }
  return trimmed;
}

export interface SafeProviderResponse {
  acknowledge: string | null;
  status: string | null;
}

/** Keeps the acknowledgement and status tokens only. Every other provider field is dropped. */
export function safeProviderResponse(
  value: unknown,
): SafeProviderResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const field = source[key];
    return typeof field === "string" ? safeText(field) : null;
  };
  const acknowledge = pick("acknowledge");
  const status = pick("status");
  if (acknowledge === null && status === null) return null;
  return { acknowledge, status };
}
