import { Hash, MessageSquare, Users } from "lucide-react";

import styles from "./discuss.module.css";

export interface DiscussHeaderProps {
  kind: "dm" | "channel";
  /** Conversations loaded so far. */
  count: number;
  /** Whether more pages exist, so the count is shown as "N+". */
  hasMore: boolean;
  /** Group conversations among the loaded ones (direct messages only). */
  groupCount: number;
  /** Initials of a few people or channels, for the decorative stack. */
  initials: string[];
}

const COPY = {
  dm: {
    title: "Direct messages",
    description: "Message one person directly, or start a group.",
    noun: "conversation",
  },
  channel: {
    title: "Channels",
    description:
      "Public and private channels for a workspace, department, or team.",
    noun: "channel",
  },
} as const;

const TONES = ["accent", "primary", "muted"] as const;

/**
 * The page header card from the Warm Studio design. Counts come from the
 * conversations already loaded, so a partial list is marked "N+" rather than
 * presented as the total.
 */
export function DiscussHeader({
  kind,
  count,
  hasMore,
  groupCount,
  initials,
}: DiscussHeaderProps) {
  const copy = COPY[kind];
  const countLabel = `${count}${hasMore ? "+" : ""}`;
  const plural = count === 1 && !hasMore ? copy.noun : `${copy.noun}s`;
  const Icon = kind === "channel" ? Hash : MessageSquare;
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageTitle}>
        <span className={styles.pageIcon} aria-hidden="true">
          <Icon className="size-6" />
        </span>
        <div className={styles.pageHeading}>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </div>
      <div className={styles.stack}>
        {initials.length > 0 ? (
          <div className={styles.stackAvatars} aria-hidden="true">
            {initials.slice(0, 4).map((value, index) => (
              <span
                key={`${value}-${index}`}
                className={styles.stackAvatar}
                data-tone={TONES[index % TONES.length]}
              >
                {value}
              </span>
            ))}
          </div>
        ) : null}
        <p className={styles.stackCount}>
          <strong>
            {countLabel} {plural}
          </strong>
          {kind === "dm" && groupCount > 0 ? (
            <span>
              <Users aria-hidden="true" className="size-3.5" />
              {groupCount} {groupCount === 1 ? "group" : "groups"}
            </span>
          ) : null}
        </p>
      </div>
    </header>
  );
}
