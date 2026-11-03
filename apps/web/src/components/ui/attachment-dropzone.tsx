"use client";

import { FileText } from "lucide-react";

import { Input } from "@/components/ui/input";

export const DEFAULT_ATTACHMENT_HINT =
  "PDF, Word, Excel, PNG, JPG, WEBP, GIF or text · Up to 100 MB each";

/** Shared drag-and-drop or click-to-pick target for every file field in the
 * app. Callers decide what to do with the picked files (validation, upload,
 * or staging until a separate Attach button is pressed). */
export function AttachmentDropzone({
  inputLabel,
  disabled,
  onFiles,
  hint = DEFAULT_ATTACHMENT_HINT,
  accept,
  multiple = true,
}: {
  inputLabel: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  hint?: string;
  accept?: string;
  multiple?: boolean;
}) {
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (disabled) return;
        onFiles(Array.from(event.dataTransfer.files));
      }}
      className="border-border flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center"
    >
      <span className="bg-background border-border text-muted-foreground inline-flex size-10 items-center justify-center rounded-lg border">
        <FileText aria-hidden="true" className="size-5" />
      </span>
      <p className="text-sm font-medium">Choose files or drop them here</p>
      <p className="text-muted-foreground text-xs">{hint}</p>
      <Input
        type="file"
        multiple={multiple}
        accept={accept}
        aria-label={inputLabel}
        disabled={disabled}
        className="mt-2 max-w-xs"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          event.target.value = "";
          onFiles(picked);
        }}
      />
    </div>
  );
}
