import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import shared from "./administration.module.css";
import styles from "./work.module.css";

/** Presentation only: the owning route and feature retain all access checks. */
export function WorkSurface({
  title,
  description,
  children,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn(shared.surface, styles.surface)}>
      {title && (
        <PageHeader
          title={title}
          description={description}
          className={shared.header ?? ""}
        />
      )}
      <div className={title ? shared.content : undefined}>{children}</div>
    </div>
  );
}
