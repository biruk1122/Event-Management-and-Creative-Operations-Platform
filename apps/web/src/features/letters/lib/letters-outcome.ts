import type {
  Letter,
  LetterCategory,
  LetterDirection,
  LetterRemark,
} from "./letters-types";

/** Loads one letter for the detail dialog; resolves `null` when it cannot. */
export type GetLetter = (id: string) => Promise<Letter | null>;

export interface CreateLetterValues {
  direction: LetterDirection;
  category: LetterCategory;
  date: string;
  projectId: string | null;
  subject: string;
  fromParty: string;
  toParty: string;
  senderReferenceNumber: string;
  shortDescription: string;
  remark: string;
}

export interface UpdateLetterValues {
  date: string;
  projectId: string | null;
  subject: string;
  fromParty: string;
  toParty: string;
  senderReferenceNumber: string;
  shortDescription: string;
  remark: string;
}

export type SaveLetterOutcome =
  | { status: "success"; letter: Letter }
  | { status: "not_found" }
  | { status: "assignment_invalid"; detail?: string }
  | {
      status: "field_errors";
      fieldErrors: Partial<Record<keyof CreateLetterValues, string>>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateLetter = (
  values: CreateLetterValues,
) => Promise<SaveLetterOutcome>;
export type UpdateLetter = (
  id: string,
  values: Partial<UpdateLetterValues>,
) => Promise<SaveLetterOutcome>;

export type DeleteLetterOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteLetter = (id: string) => Promise<DeleteLetterOutcome>;

export type AddRemarkOutcome =
  | { status: "success"; remark: LetterRemark }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type ListRemarks = (letterId: string) => Promise<LetterRemark[] | null>;
export type AddRemark = (
  letterId: string,
  body: string,
) => Promise<AddRemarkOutcome>;
