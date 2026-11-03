/** Attachment limits shared by the create dialog and the details page. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

/** Why a file cannot be attached, or null when it can. Mirrors the server's
 * own managed-file checks; the server remains the authority. */
export function attachmentProblem(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES)
    return `${file.name} (larger than 100 MB)`;
  if (file.type && !ALLOWED_ATTACHMENT_TYPES.has(file.type))
    return `${file.name} (unsupported file type)`;
  return null;
}
