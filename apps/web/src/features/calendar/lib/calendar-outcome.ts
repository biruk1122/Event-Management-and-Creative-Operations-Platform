import type { CalendarEntry, MutableCalendarEntryType } from "./calendar-types";

/** The fields the single create/edit dialog collects. `type` is fixed after
 * creation - `UpdateCalendarEntryDto` has no such field - so it is only ever
 * sent on create; the dialog still carries it through edit for display. */
export interface CalendarEntryFormValues {
  title: string;
  description: string;
  type: MutableCalendarEntryType;
  /** `datetime-local` value. */
  startAt: string;
  /** `datetime-local` value, or empty for none. */
  endAt: string;
}

type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Result of `POST /calendar`. */
export type CreateCalendarEntryOutcome =
  | { status: "success"; entry: CalendarEntry }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof CalendarEntryFormValues>;
    }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type CreateCalendarEntry = (
  values: CalendarEntryFormValues,
) => Promise<CreateCalendarEntryOutcome>;

/** Result of `PATCH /calendar/:id`. */
export type UpdateCalendarEntryOutcome =
  | { status: "success"; entry: CalendarEntry }
  | { status: "schedule_invalid" }
  | {
      status: "field_errors";
      fieldErrors: FieldErrors<keyof CalendarEntryFormValues>;
    }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type UpdateCalendarEntry = (
  id: string,
  values: CalendarEntryFormValues,
) => Promise<UpdateCalendarEntryOutcome>;

/** Result of `DELETE /calendar/:id`. */
export type DeleteCalendarEntryOutcome =
  | { status: "success" }
  | { status: "not_found" }
  | { status: "permission_denied" }
  | { status: "unexpected" };

export type DeleteCalendarEntry = (
  id: string,
) => Promise<DeleteCalendarEntryOutcome>;
