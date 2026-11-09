// `zod/mini` keeps the same validation as `zod` at a fraction of the size.
// This file is imported by the browser API client, so it ships on every page
// (EVE-233 bundle budget).
import * as z from "zod/mini";

/** True when the runtime knows the IANA zone, so a typo fails at startup. */
function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const clientEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
  NEXT_PUBLIC_WS_URL: z.url(),
  NEXT_PUBLIC_APP_TIMEZONE: z._default(
    z
      .string()
      .check(
        z.refine(
          isIanaTimeZone,
          "NEXT_PUBLIC_APP_TIMEZONE must be an IANA time zone",
        ),
      ),
    "Africa/Addis_Ababa",
  ),
});

export const clientEnvironment = clientEnvironmentSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_APP_TIMEZONE: process.env.NEXT_PUBLIC_APP_TIMEZONE || undefined,
});
