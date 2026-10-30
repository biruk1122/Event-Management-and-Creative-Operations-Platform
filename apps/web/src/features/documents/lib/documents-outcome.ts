import type { DocumentRecord, DocumentType } from "./documents-types";

/** Loads one document for the detail dialog; resolves `null` when it cannot. */
export type GetDocument = (id: string) => Promise<DocumentRecord | null>;

export interface CreateDocumentValues {
  displayName: string;
  documentType: DocumentType;
  projectId: string | null;
  description: string;
}

export interface UpdateDocumentValues {
  displayName: string;
  documentType: DocumentType;
  projectId: string | null;
  description: string;
}

export type SaveDocumentOutcome =
  | { status: "success"; document: DocumentRecord }
  | { status: "not_found" }
  | { status: "assignment_invalid"; detail?: string }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof CreateDocumentValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateDocument = (
  values: CreateDocumentValues,
) => Promise<SaveDocumentOutcome>;
export type UpdateDocument = (
  id: string,
  values: Partial<UpdateDocumentValues>,
) => Promise<SaveDocumentOutcome>;

export type DeleteDocumentOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteDocument = (id: string) => Promise<DeleteDocumentOutcome>;
