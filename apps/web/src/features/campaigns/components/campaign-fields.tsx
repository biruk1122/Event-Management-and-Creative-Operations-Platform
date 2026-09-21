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

import type {
  CampaignFieldErrors,
  CampaignFieldValues,
  SubjectKind,
} from "../lib/campaigns-form";
import {
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPES,
  type AssignableEvent,
  type CampaignType,
} from "../lib/campaigns-types";

const SUBJECT_LABELS: Record<SubjectKind, string> = {
  NONE: "No related subject",
  EVENT: "An event",
  PRODUCT: "A product",
};

interface CampaignFieldsProps {
  values: CampaignFieldValues;
  errors: CampaignFieldErrors;
  disabled?: boolean;
  events: readonly AssignableEvent[];
  onChange: <K extends keyof CampaignFieldValues>(
    key: K,
    value: CampaignFieldValues[K],
  ) => void;
}

/** The campaign attributes shared by the create and edit forms. */
export function CampaignFields({
  values,
  errors,
  disabled,
  events,
  onChange,
}: CampaignFieldsProps) {
  const ids = {
    name: useId(),
    type: useId(),
    description: useId(),
    audience: useId(),
    startAt: useId(),
    endAt: useId(),
    subject: useId(),
    event: useId(),
    product: useId(),
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
          value={values.campaignType}
          disabled={disabled ?? false}
          onValueChange={(value) =>
            onChange("campaignType", value as CampaignType)
          }
        >
          <SelectTrigger id={ids.type}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAMPAIGN_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {CAMPAIGN_TYPE_LABELS[type]}
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

      <div className="space-y-2">
        <Label htmlFor={ids.audience}>Target audience</Label>
        <Input
          id={ids.audience}
          value={values.audience}
          disabled={disabled}
          placeholder="Who is this campaign for?"
          onChange={(event) => onChange("audience", event.target.value)}
        />
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
        <Label htmlFor={ids.subject}>Related subject (optional)</Label>
        <Select
          value={values.subjectKind}
          disabled={disabled ?? false}
          onValueChange={(value) =>
            onChange("subjectKind", value as SubjectKind)
          }
        >
          <SelectTrigger id={ids.subject}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SUBJECT_LABELS) as SubjectKind[]).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {SUBJECT_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          A campaign relates to an event or a product, not both.
        </p>
      </div>

      {values.subjectKind === "EVENT" ? (
        <div className="space-y-2">
          <Label htmlFor={ids.event}>Event</Label>
          <Select
            value={values.eventId ?? ""}
            disabled={disabled ?? false}
            onValueChange={(value) => onChange("eventId", value)}
          >
            <SelectTrigger
              id={ids.event}
              aria-invalid={errors.eventId ? true : undefined}
              aria-describedby={
                errors.eventId ? `${ids.event}-error` : undefined
              }
            >
              <SelectValue placeholder="Choose an event…" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.eventId ? (
            <p id={`${ids.event}-error`} className="text-destructive text-sm">
              {errors.eventId}
            </p>
          ) : null}
        </div>
      ) : null}

      {values.subjectKind === "PRODUCT" ? (
        <div className="space-y-2">
          <Label htmlFor={ids.product}>Product name</Label>
          <Input
            id={ids.product}
            value={values.productName}
            disabled={disabled}
            aria-invalid={errors.productName ? true : undefined}
            aria-describedby={
              errors.productName ? `${ids.product}-error` : undefined
            }
            onChange={(event) => onChange("productName", event.target.value)}
          />
          {errors.productName ? (
            <p id={`${ids.product}-error`} className="text-destructive text-sm">
              {errors.productName}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
