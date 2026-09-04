const CSRF_COOKIE = "csrf_token";

/**
 * Read the non-HttpOnly `csrf_token` cookie set by the API on sign in. Its
 * value must be echoed in the `x-csrf-token` header on state-changing
 * authenticated requests (logout, refresh). Returns null off the browser or
 * when the cookie is absent.
 */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));

  if (!entry) {
    return null;
  }

  return decodeURIComponent(entry.slice(CSRF_COOKIE.length + 1));
}
