/** A single best-effort GPS read for a mobile check-in/out. Never rejects:
 * permission denial, an unavailable API, or a timeout all resolve to
 * `null`, matching the backend's own "omit entirely when unavailable"
 * contract (`MobilePunchDto.latitude`/`longitude` are optional) - the punch
 * is still recorded and flagged for review, never blocked client-side. */
export function readCurrentPosition(
  timeoutMs = 8000,
): Promise<{ latitude: number; longitude: number; accuracyMeters: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
