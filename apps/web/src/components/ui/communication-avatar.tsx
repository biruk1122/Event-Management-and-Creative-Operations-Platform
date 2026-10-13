/** Decorative initials; the adjacent visible name remains authoritative. */
export function CommunicationAvatar({
  name,
  channel = false,
}: {
  name: string;
  channel?: boolean;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
  return (
    <span
      aria-hidden="true"
      className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
    >
      {channel ? "#" : initials || "?"}
    </span>
  );
}
