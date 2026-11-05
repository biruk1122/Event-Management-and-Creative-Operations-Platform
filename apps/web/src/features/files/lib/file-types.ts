export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;
export type EventFile = {
  id: string;
  filename: string;
  mediaType: (typeof ACCEPTED_FILE_TYPES)[number];
  sizeBytes: number;
  state: "available";
  createdAt: string;
};
/** Exact size in bytes, KB or MB, as the file list shows it. */
export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};
export function fileSelectionError(file: File): string | null {
  if (!ACCEPTED_FILE_TYPES.includes(file.type as EventFile["mediaType"]))
    return "Choose a PDF, image, plain-text, CSV, or Office document.";
  if (file.size < 1) return "Choose a file that is not empty.";
  if (file.size > MAX_FILE_BYTES) return "Choose a file smaller than 100 MB.";
  return null;
}
