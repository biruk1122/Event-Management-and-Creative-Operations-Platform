import { clientEnvironment } from "@/env/client";

/**
 * The absolute URL of a talent's profile photo, or null when there is none. The
 * API returns a path under its own base URL, so it is resolved against that base.
 */
export function talentPhotoSrc(
  profileImageUrl: string | null | undefined,
): string | null {
  if (!profileImageUrl) return null;
  return new URL(
    profileImageUrl,
    clientEnvironment.NEXT_PUBLIC_API_URL,
  ).toString();
}
