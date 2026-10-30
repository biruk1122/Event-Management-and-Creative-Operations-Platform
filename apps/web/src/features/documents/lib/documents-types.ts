import type { components } from "@event-platform/api-client";

export type DocumentRecord = components["schemas"]["DocumentResponse"];
export type PaginatedDocuments =
  components["schemas"]["PaginatedDocumentsResponse"];
export type DocumentOptions = components["schemas"]["DocumentOptionsResponse"];
export type DocumentType = DocumentRecord["documentType"];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  LETTER: "Letter",
  REPORT: "Report",
  PRICE_QUOTATION: "Price quotation",
  CONTRACT: "Contract",
  INVOICE: "Invoice",
  OTHER: "Other",
};
