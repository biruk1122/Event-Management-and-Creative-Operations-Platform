/**
 * Ethiopian mobile numbers only. Accepts the national forms (09…, 07…, 9…,
 * 7…), the country-code forms (251…, +251…), and returns E.164 (+251…).
 * Anything else is rejected rather than guessed at.
 */
export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: "MISSING_PHONE_NUMBER" | "INVALID_PHONE_NUMBER" };

const NATIONAL_MOBILE = /^[97]\d{8}$/;

export function normalizeEthiopianPhone(
  input: string | null | undefined,
): PhoneResult {
  if (input === null || input === undefined || input.trim() === "") {
    return { ok: false, reason: "MISSING_PHONE_NUMBER" };
  }
  const compact = input.replace(/[\s\-().]/g, "");
  let national: string | null = null;
  if (compact.startsWith("+251")) national = compact.slice(4);
  else if (compact.startsWith("251")) national = compact.slice(3);
  else if (compact.startsWith("0")) national = compact.slice(1);
  else national = compact;

  if (national !== null && NATIONAL_MOBILE.test(national)) {
    return { ok: true, e164: `+251${national}` };
  }
  return { ok: false, reason: "INVALID_PHONE_NUMBER" };
}

/** Shows only the country code and the last three digits, for admin screens. */
export function maskPhone(e164: string | null): string | null {
  if (!e164) return null;
  return `${e164.slice(0, 4)}******${e164.slice(-3)}`;
}
