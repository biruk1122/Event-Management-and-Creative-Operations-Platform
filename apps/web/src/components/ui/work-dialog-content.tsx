"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { AdministrationDialogContent } from "./administration-dialog-content";
import styles from "./work.module.css";

export function WorkDialogContent({
  className,
  ...props
}: ComponentProps<typeof AdministrationDialogContent>) {
  return (
    <AdministrationDialogContent
      {...props}
      className={cn(styles.dialog, className)}
      fallbackSelector="[data-work-toolbar] button:not(:disabled), [data-work-filters] input:not(:disabled)"
    />
  );
}
