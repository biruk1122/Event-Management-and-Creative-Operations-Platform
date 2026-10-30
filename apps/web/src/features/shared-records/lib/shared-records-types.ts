import type { components } from "@event-platform/api-client";

export type SharedLetter = components["schemas"]["SharedLetterResponse"];
export type PaginatedSharedLetters =
  components["schemas"]["PaginatedSharedLettersResponse"];
export type SharedDocument = components["schemas"]["SharedDocumentResponse"];
export type PaginatedSharedDocuments =
  components["schemas"]["PaginatedSharedDocumentsResponse"];

/** The list view's row shape - plain `LetterResponse`/`DocumentResponse`,
 * with no per-item `shareScope` (only the single-record detail view
 * resolves and exposes the caller's current scope). */
export type SharedLetterListItem = PaginatedSharedLetters["items"][number];
export type SharedDocumentListItem = PaginatedSharedDocuments["items"][number];

export function canDownloadShared(
  record: Pick<SharedLetter | SharedDocument, "shareScope">,
): boolean {
  return record.shareScope === "VIEW_AND_DOWNLOAD";
}
