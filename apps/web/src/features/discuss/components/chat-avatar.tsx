import { Hash, Users } from "lucide-react";
import styles from "./discuss.module.css";

export function ChatAvatar({
  name,
  kind = "DIRECT",
}: {
  name: string;
  kind?: string;
}) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {kind === "CHANNEL" ? (
        <Hash className="size-5" />
      ) : kind === "GROUP" ? (
        <Users className="size-5" />
      ) : (
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}
