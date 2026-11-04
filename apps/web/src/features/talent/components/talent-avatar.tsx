"use client";

import { useState } from "react";

import { talentPhotoSrc } from "../lib/talent-photo";

const SIZE_CLASS = {
  sm: "size-10 text-xs",
  lg: "size-20 text-2xl",
  /** The large avatar in the profile overview. */
  hero: "size-24 text-3xl font-semibold",
  /** The square photo at the left of a directory card. */
  tile: "size-28 shrink-0 text-3xl font-light",
  /** Fills a card's cover area; the initials are large and light, as on the prototype cards. */
  cover: "size-full text-6xl font-light",
} as const;

/** initials from the name, used when there is no photo or the photo cannot load. */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase();
}

interface TalentAvatarProps {
  fullName: string;
  profileImageUrl: string | null;
  size?: keyof typeof SIZE_CLASS;
}

/**
 * The profile photo, or the initials when there is no photo or it fails to
 * load. The name sits beside the avatar in every use, so the image is decorative.
 */
export function TalentAvatar({
  fullName,
  profileImageUrl,
  size = "sm",
}: TalentAvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : talentPhotoSrc(profileImageUrl);
  const sizeClass = SIZE_CLASS[size];
  const shape =
    size === "cover" ? "" : size === "tile" ? "rounded-xl" : "rounded-full";

  if (src) {
    return (
      // A talent photo served by the API, so it is not optimized by Next.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`${sizeClass} ${shape} bg-muted shrink-0 object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} ${shape} bg-primary/10 text-primary flex shrink-0 items-center justify-center font-medium`}
    >
      {initials(fullName)}
    </span>
  );
}
