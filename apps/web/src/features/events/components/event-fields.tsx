"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  type EventType,
} from "../lib/events-types";

/** The event attributes shared by the create and edit forms. */
export interface EventFieldValues {
  name: string;
  eventType: EventType;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  organizerName: string;
}

interface EventFieldsProps {
  values: EventFieldValues;
  errors: Partial<Record<keyof EventFieldValues, string>>;
  disabled?: boolean;
  onChange: <K extends keyof EventFieldValues>(
    key: K,
    value: EventFieldValues[K],
  ) => void;
}

export function EventFields({
  values,
  errors,
  disabled,
  onChange,
}: EventFieldsProps) {
  const ids = {
    name: useId(),
    type: useId(),
    description: useId(),
    startAt: useId(),
    endAt: useId(),
    location: useId(),
    organizer: useId(),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={values.name}
          disabled={disabled}
          required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          onChange={(event) => onChange("name", event.target.value)}
        />
        {errors.name ? (
          <p id={`${ids.name}-error`} className="text-destructive text-sm">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.type}>Type</Label>
        <Select
          value={values.eventType}
          disabled={disabled ?? false}
          onValueChange={(value) => onChange("eventType", value as EventType)}
        >
          <SelectTrigger id={ids.type}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {EVENT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.description}>Description</Label>
        <textarea
          id={ids.description}
          rows={3}
          value={values.description}
          disabled={disabled}
          aria-invalid={errors.description ? true : undefined}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => onChange("description", event.target.value)}
        />
        {errors.description ? (
          <p className="text-destructive text-sm">{errors.description}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={ids.startAt}>Starts (UTC)</Label>
          <Input
            id={ids.startAt}
            type="datetime-local"
            value={values.startAt}
            disabled={disabled}
            onChange={(event) => onChange("startAt", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.endAt}>Ends (UTC)</Label>
          <Input
            id={ids.endAt}
            type="datetime-local"
            value={values.endAt}
            disabled={disabled}
            aria-invalid={errors.endAt ? true : undefined}
            aria-describedby={errors.endAt ? `${ids.endAt}-error` : undefined}
            onChange={(event) => onChange("endAt", event.target.value)}
          />
          {errors.endAt ? (
            <p id={`${ids.endAt}-error`} className="text-destructive text-sm">
              {errors.endAt}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={ids.location}>Location</Label>
          <Input
            id={ids.location}
            value={values.location}
            disabled={disabled}
            onChange={(event) => onChange("location", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.organizer}>Organizer</Label>
          <Input
            id={ids.organizer}
            value={values.organizerName}
            disabled={disabled}
            onChange={(event) => onChange("organizerName", event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
