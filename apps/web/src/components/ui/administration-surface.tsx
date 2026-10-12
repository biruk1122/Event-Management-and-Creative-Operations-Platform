import type { ReactNode } from "react";

import { PageHeader } from "./page-header";
import styles from "./administration.module.css";

/** Presentation only; route and feature guards still own authorization. */
export function AdministrationSurface({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.surface}>
      <PageHeader
        title={title}
        description={description}
        className={styles.header ?? ""}
      />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
