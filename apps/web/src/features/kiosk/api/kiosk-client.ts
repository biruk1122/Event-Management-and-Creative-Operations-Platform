import { createApiClient } from "@event-platform/api-client";

import { clientEnvironment } from "@/env/client";

const STORAGE_KEY = "lela:kiosk:credentials";

export interface KioskCredentials {
  kioskId: string;
  token: string;
  kioskName: string;
}

/** The kiosk's own bearer secret, kept only in this browser's storage -
 * never a cookie, never sent anywhere but this one device's own requests.
 * A private window or cleared site data simply re-triggers activation. */
export function readKioskCredentials(): KioskCredentials | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<KioskCredentials>;
    if (
      typeof parsed.kioskId === "string" &&
      typeof parsed.token === "string" &&
      typeof parsed.kioskName === "string"
    ) {
      return { kioskId: parsed.kioskId, token: parsed.token, kioskName: parsed.kioskName };
    }
    return null;
  } catch {
    return null;
  }
}

export function storeKioskCredentials(credentials: KioskCredentials): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Storage unavailable (private window, quota) - activation will simply
    // be asked for again next time; never throw out of a device-setup flow.
  }
}

export function clearKioskCredentials(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

/** A device-authenticated client, distinct from `browserApi` - it carries
 * the kiosk's own `X-Kiosk-Id`/`X-Kiosk-Token` headers instead of a user's
 * session cookie, since no employee is ever logged in on this shared
 * device. */
export const kioskApi = createApiClient({
  baseUrl: clientEnvironment.NEXT_PUBLIC_API_URL,
  getHeaders: () => {
    const credentials = readKioskCredentials();
    return credentials
      ? { "x-kiosk-id": credentials.kioskId, "x-kiosk-token": credentials.token }
      : {};
  },
});
