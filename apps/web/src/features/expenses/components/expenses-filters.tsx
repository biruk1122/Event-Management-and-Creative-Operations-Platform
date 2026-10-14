"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  type AssignableEvent,
  type ExpenseCategory,
  type ExpenseStatus,
} from "../lib/expenses-types";

const ALL = "ALL";

interface ExpensesFiltersProps {
  status: ExpenseStatus | null;
  category: ExpenseCategory | null;
  eventId: string | null;
  events: readonly AssignableEvent[];
  onStatusChange: (status: ExpenseStatus | null) => void;
  onCategoryChange: (category: ExpenseCategory | null) => void;
  onEventChange: (eventId: string | null) => void;
}

export function ExpensesFilters({
  status,
  category,
  eventId,
  events,
  onStatusChange,
  onCategoryChange,
  onEventChange,
}: ExpensesFiltersProps) {
  const statusId = useId();
  const categoryId = useId();
  const eventFieldId = useId();

  return (
    <div
      data-work-filters
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="space-y-2 sm:w-44">
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) =>
            onStatusChange(value === ALL ? null : (value as ExpenseStatus))
          }
        >
          <SelectTrigger id={statusId} aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {EXPENSE_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {EXPENSE_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 sm:w-48">
        <Label htmlFor={categoryId}>Category</Label>
        <Select
          value={category ?? ALL}
          onValueChange={(value) =>
            onCategoryChange(value === ALL ? null : (value as ExpenseCategory))
          }
        >
          <SelectTrigger id={categoryId} aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {EXPENSE_CATEGORY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-2">
        <Label htmlFor={eventFieldId}>Event</Label>
        <Select
          value={eventId ?? ALL}
          onValueChange={(value) => onEventChange(value === ALL ? null : value)}
        >
          <SelectTrigger id={eventFieldId} aria-label="Filter by event">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All events</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
