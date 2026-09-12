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

import type { AssignableEvent } from "../lib/projects-types";

const NO_EVENT = "NONE";

/** The project attributes shared by the create and edit forms. */
export interface ProjectFieldValues {
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  eventId: string | null;
}

interface ProjectFieldsProps {
  values: ProjectFieldValues;
  errors: Partial<Record<keyof ProjectFieldValues, string>>;
  disabled?: boolean;
  events: readonly AssignableEvent[];
  onChange: <K extends keyof ProjectFieldValues>(
    key: K,
    value: ProjectFieldValues[K],
  ) => void;
}

export function ProjectFields({
  values,
  errors,
  disabled,
  events,
  onChange,
}: ProjectFieldsProps) {
  const ids = {
    name: useId(),
    description: useId(),
    startAt: useId(),
    endAt: useId(),
    event: useId(),
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

      <div className="space-y-2">
        <Label htmlFor={ids.event}>Related event (optional)</Label>
        <Select
          value={values.eventId ?? NO_EVENT}
          disabled={disabled ?? false}
          onValueChange={(value) =>
            onChange("eventId", value === NO_EVENT ? null : value)
          }
        >
          <SelectTrigger id={ids.event}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_EVENT}>No related event</SelectItem>
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
