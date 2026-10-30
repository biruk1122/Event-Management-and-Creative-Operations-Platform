"use client";

import { useId, useState, type FormEvent } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CurrentAccess } from "@/features/auth/api/access-queries";

import {
  useCalendarMutations,
  useHolidays,
  useWeekdaySchedule,
} from "../api/attendance-queries";
import { AttendanceRequestError } from "../api/attendance-gateway";
import type { Holiday, WeekdaySchedule } from "../lib/attendance-types";

const DAY_TYPE_LABELS: Record<WeekdaySchedule["type"], string> = {
  FULL: "Full working day",
  HALF: "Half working day",
  OFF: "Day off",
};

const WEEKDAY_FORM_ERRORS: Record<string, string> = {
  conflict: "A change for this weekday is already effective from that date.",
  permission_denied: "You do not have permission to manage the work calendar.",
  unexpected: "We could not save that change. Try again.",
};

const HOLIDAY_FORM_ERRORS: Record<string, string> = {
  date_taken: "A holiday is already recorded for that date.",
  not_found: "That holiday no longer exists.",
  permission_denied: "You do not have permission to manage the work calendar.",
  unexpected: "We could not save that holiday. Try again.",
};

export interface AttendanceCalendarManagerProps {
  access: CurrentAccess;
}

export function AttendanceCalendarManager({
  access,
}: AttendanceCalendarManagerProps) {
  const weekdays = useWeekdaySchedule(access);
  const holidays = useHolidays(access);
  const mutations = useCalendarMutations(access);

  return (
    <div className="space-y-8">
      <WeeklyScheduleSection weekdays={weekdays} mutations={mutations} />
      <HolidaysSection holidays={holidays} mutations={mutations} />
    </div>
  );
}

function WeeklyScheduleSection({
  weekdays,
  mutations,
}: {
  weekdays: ReturnType<typeof useWeekdaySchedule>;
  mutations: ReturnType<typeof useCalendarMutations>;
}) {
  const [editingDay, setEditingDay] = useState<number | null>(null);

  return (
    <section className="space-y-4" aria-labelledby="weekly-schedule-heading">
      <div>
        <h2 id="weekly-schedule-heading" className="text-lg font-semibold">
          Weekly schedule
        </h2>
        <p className="text-muted-foreground text-sm">
          Each weekday&apos;s current type. Changing a day records a new
          effective-dated entry - past reports keep using the rule that was
          actually in effect on each historical date.
        </p>
      </div>

      {weekdays.isPending ? (
        <p role="status">Loading the weekly schedule…</p>
      ) : weekdays.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {weekdays.error instanceof AttendanceRequestError
              ? weekdays.error.message
              : "We could not load the weekly schedule. Try again."}
          </p>
          <Button variant="outline" onClick={() => void weekdays.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {(weekdays.data ?? []).map((day) => (
            <li key={day.dayOfWeek} className="rounded-xl border p-4">
              {editingDay === day.dayOfWeek ? (
                <WeekdayEditForm
                  day={day}
                  mutations={mutations}
                  onDone={() => setEditingDay(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{day.dayName}</p>
                    <p className="text-muted-foreground text-sm">
                      {DAY_TYPE_LABELS[day.type]} · effective from{" "}
                      {day.effectiveFrom}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingDay(day.dayOfWeek)}
                  >
                    Change
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WeekdayEditForm({
  day,
  mutations,
  onDone,
}: {
  day: WeekdaySchedule;
  mutations: ReturnType<typeof useCalendarMutations>;
  onDone: () => void;
}) {
  const typeId = useId();
  const dateId = useId();
  const [type, setType] = useState<WeekdaySchedule["type"]>(day.type);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const outcome = await mutations.createWeekdaySchedule.mutateAsync({
      dayOfWeek: day.dayOfWeek,
      type,
      effectiveFrom,
    });
    if (outcome.status === "success") {
      onDone();
      return;
    }
    if (outcome.status === "field_errors") {
      setFormError(
        Object.values(outcome.fieldErrors)[0] ??
          WEEKDAY_FORM_ERRORS.unexpected!,
      );
      return;
    }
    setFormError(
      WEEKDAY_FORM_ERRORS[outcome.status] ?? WEEKDAY_FORM_ERRORS.unexpected!,
    );
  }

  return (
    <form
      aria-label={`Change ${day.dayName}`}
      className="space-y-3"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p className="font-medium">{day.dayName}</p>
      {formError ? (
        <Alert variant="destructive" aria-live="assertive">
          <AlertTitle>{formError}</AlertTitle>
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={typeId}>New type</Label>
          <Select
            value={type}
            onValueChange={(value) => setType(value as WeekdaySchedule["type"])}
          >
            <SelectTrigger id={typeId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FULL">Full working day</SelectItem>
              <SelectItem value="HALF">Half working day</SelectItem>
              <SelectItem value="OFF">Day off</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={dateId}>Effective from</Label>
          <Input
            id={dateId}
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            disabled={mutations.createWeekdaySchedule.isPending}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={mutations.createWeekdaySchedule.isPending}
          aria-busy={mutations.createWeekdaySchedule.isPending}
        >
          {mutations.createWeekdaySchedule.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function HolidaysSection({
  holidays,
  mutations,
}: {
  holidays: ReturnType<typeof useHolidays>;
  mutations: ReturnType<typeof useCalendarMutations>;
}) {
  const dateId = useId();
  const nameId = useId();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"date" | "name", string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const localErrors: Partial<Record<"date" | "name", string>> = {};
    if (date.trim() === "") localErrors.date = "Choose a date.";
    if (name.trim() === "") localErrors.name = "Enter a name.";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }
    setFieldErrors({});
    const outcome = await mutations.createHoliday.mutateAsync({ date, name });
    switch (outcome.status) {
      case "success":
        setDate("");
        setName("");
        return;
      case "field_errors":
        setFieldErrors(outcome.fieldErrors);
        return;
      default:
        setFormError(
          HOLIDAY_FORM_ERRORS[outcome.status] ??
            HOLIDAY_FORM_ERRORS.unexpected!,
        );
    }
  }

  async function handleRemove(id: string) {
    await mutations.removeHoliday.mutateAsync(id);
  }

  return (
    <section className="space-y-4" aria-labelledby="holidays-heading">
      <div>
        <h2 id="holidays-heading" className="text-lg font-semibold">
          Holidays
        </h2>
        <p className="text-muted-foreground text-sm">
          One-off dates that override the weekly schedule, even on an otherwise
          full working day.
        </p>
      </div>

      <form
        aria-label="Add holiday"
        className="space-y-4 rounded-xl border p-4"
        noValidate
        onSubmit={(event) => void handleAdd(event)}
      >
        {formError ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertTitle>{formError}</AlertTitle>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={dateId}>Date</Label>
            <Input
              id={dateId}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={mutations.createHoliday.isPending}
              aria-invalid={Boolean(fieldErrors.date)}
            />
            {fieldErrors.date ? (
              <p className="text-destructive text-sm">{fieldErrors.date}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={mutations.createHoliday.isPending}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-destructive text-sm">{fieldErrors.name}</p>
            ) : null}
          </div>
        </div>
        <Button
          type="submit"
          disabled={mutations.createHoliday.isPending}
          aria-busy={mutations.createHoliday.isPending}
        >
          {mutations.createHoliday.isPending ? "Adding…" : "Add holiday"}
        </Button>
      </form>

      {holidays.isPending ? (
        <p role="status">Loading holidays…</p>
      ) : holidays.isError ? (
        <div role="alert" className="space-y-2">
          <p>
            {holidays.error instanceof AttendanceRequestError
              ? holidays.error.message
              : "We could not load holidays. Try again."}
          </p>
          <Button variant="outline" onClick={() => void holidays.refetch()}>
            Try again
          </Button>
        </div>
      ) : (holidays.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No holidays recorded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {(holidays.data ?? []).map((holiday) =>
            editingId === holiday.id ? (
              <li key={holiday.id} className="rounded-xl border p-4">
                <HolidayEditForm
                  holiday={holiday}
                  mutations={mutations}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={holiday.id}
                className="flex items-center justify-between gap-4 rounded-xl border p-4"
              >
                <div>
                  <p className="font-medium">{holiday.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {holiday.date}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingId(holiday.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={mutations.removeHoliday.isPending}
                    onClick={() => void handleRemove(holiday.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function HolidayEditForm({
  holiday,
  mutations,
  onDone,
}: {
  holiday: Holiday;
  mutations: ReturnType<typeof useCalendarMutations>;
  onDone: () => void;
}) {
  const dateId = useId();
  const nameId = useId();
  const [date, setDate] = useState(holiday.date);
  const [name, setName] = useState(holiday.name);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const outcome = await mutations.updateHoliday.mutateAsync({
      id: holiday.id,
      values: { date, name },
    });
    if (outcome.status === "success") {
      onDone();
      return;
    }
    if (outcome.status === "field_errors") {
      setFormError(
        Object.values(outcome.fieldErrors)[0] ??
          HOLIDAY_FORM_ERRORS.unexpected!,
      );
      return;
    }
    setFormError(
      HOLIDAY_FORM_ERRORS[outcome.status] ?? HOLIDAY_FORM_ERRORS.unexpected!,
    );
  }

  return (
    <form
      aria-label={`Edit ${holiday.name}`}
      className="space-y-3"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      {formError ? (
        <Alert variant="destructive" aria-live="assertive">
          <AlertTitle>{formError}</AlertTitle>
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={dateId}>Date</Label>
          <Input
            id={dateId}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={mutations.updateHoliday.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={mutations.updateHoliday.isPending}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={mutations.updateHoliday.isPending}
          aria-busy={mutations.updateHoliday.isPending}
        >
          {mutations.updateHoliday.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
