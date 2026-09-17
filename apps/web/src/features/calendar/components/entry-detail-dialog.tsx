"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { formatFullDate, formatTime } from "../lib/calendar-date";
import {
  CALENDAR_ENTRY_TYPE_LABELS,
  type CalendarEntry,
} from "../lib/calendar-types";

export interface EntryDetailDialogProps {
  entry: CalendarEntry | null;
  onOpenChange: (open: boolean) => void;
}

/** EVENT, TASK, and PROJECT entries are read-only projections aggregated
 * from their own modules (calendar.controller.ts) - this dialog only ever
 * displays them, it never edits or deletes. */
export function EntryDetailDialog({
  entry,
  onOpenChange,
}: EntryDetailDialogProps) {
  return (
    <Dialog open={entry != null} onOpenChange={onOpenChange}>
      <DialogContent>
        {entry ? (
          <>
            <DialogHeader>
              <DialogTitle>{entry.title}</DialogTitle>
              <DialogDescription>
                {CALENDAR_ENTRY_TYPE_LABELS[entry.type]} ·{" "}
                {formatFullDate(new Date(entry.startAt))} at{" "}
                {formatTime(new Date(entry.startAt))}
              </DialogDescription>
            </DialogHeader>
            {entry.description ? (
              <p className="text-sm">{entry.description}</p>
            ) : null}
            <p className="text-muted-foreground text-sm">
              This entry is managed by its{" "}
              {CALENDAR_ENTRY_TYPE_LABELS[entry.type].toLowerCase()} record, not
              from the calendar.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
