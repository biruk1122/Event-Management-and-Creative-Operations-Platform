/**
 * The path a request is logged under. Strips the query string, and replaces
 * the secret segment of SMS provider callbacks, so the callback token never
 * reaches the logs.
 */
export function logUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const path = url.split("?")[0] ?? url;
  return path.replace(/^(\/api\/v1\/sms\/callbacks\/)[^/]+/, "$1[REDACTED]");
}
