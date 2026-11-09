"use client";

import { useEffect, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listCampaigns } from "@/features/campaigns/api/campaigns-gateway";
import { collectAllPages } from "@/lib/collect-all-pages";

import type { PartnerFieldValues } from "../lib/partners-outcome";
import { PARTNERSHIP_TYPE_LABELS } from "../lib/partners-types";

const SELECT_CLASS =
  "border-input focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const TEXTAREA_CLASS =
  "border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/** Campaigns a partnership may relate to, every page of them (EVE-233). */
function useCampaignOptions(enabled: boolean) {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>(
    [],
  );
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    collectAllPages((page) =>
      listCampaigns({ page, pageSize: 100 }, controller.signal),
    ).then(
      (items) =>
        setCampaigns(items.map((item) => ({ id: item.id, name: item.name }))),
      () => undefined,
    );
    return () => controller.abort();
  }, [enabled]);
  return campaigns;
}

interface PartnerFieldsProps {
  values: PartnerFieldValues;
  errors: Partial<Record<keyof PartnerFieldValues, string>>;
  disabled?: boolean;
  onChange: <K extends keyof PartnerFieldValues>(
    key: K,
    value: PartnerFieldValues[K],
  ) => void;
}

export function PartnerFields({
  values,
  errors,
  disabled,
  onChange,
}: PartnerFieldsProps) {
  const ids = {
    organizationName: useId(),
    category: useId(),
    contactName: useId(),
    contactEmail: useId(),
    contactPhone: useId(),
    proposedContribution: useId(),
    followUpAt: useId(),
    notes: useId(),
    partnershipName: useId(),
    partnershipType: useId(),
    campaignId: useId(),
    agreementDetails: useId(),
    agreementStartOn: useId(),
    agreementEndOn: useId(),
    agreedValueAmount: useId(),
    agreedValueCurrency: useId(),
  };
  const campaigns = useCampaignOptions(!disabled || values.campaignId !== "");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={ids.organizationName}>Organization name</Label>
        <Input
          id={ids.organizationName}
          value={values.organizationName}
          disabled={disabled}
          required
          aria-invalid={errors.organizationName ? true : undefined}
          aria-describedby={
            errors.organizationName
              ? `${ids.organizationName}-error`
              : undefined
          }
          onChange={(event) => onChange("organizationName", event.target.value)}
        />
        {errors.organizationName ? (
          <p
            id={`${ids.organizationName}-error`}
            className="text-destructive text-sm"
          >
            {errors.organizationName}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.category}>Category</Label>
        <Input
          id={ids.category}
          value={values.category}
          disabled={disabled}
          required
          placeholder="Media, Sponsor, Brand…"
          aria-invalid={errors.category ? true : undefined}
          onChange={(event) => onChange("category", event.target.value)}
        />
        {errors.category ? (
          <p className="text-destructive text-sm">{errors.category}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={ids.contactName}>Contact name (optional)</Label>
          <Input
            id={ids.contactName}
            value={values.contactName}
            disabled={disabled}
            onChange={(event) => onChange("contactName", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.contactPhone}>Contact phone (optional)</Label>
          <Input
            id={ids.contactPhone}
            value={values.contactPhone}
            disabled={disabled}
            onChange={(event) => onChange("contactPhone", event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.contactEmail}>Contact email (optional)</Label>
        <Input
          id={ids.contactEmail}
          type="email"
          value={values.contactEmail}
          disabled={disabled}
          aria-invalid={errors.contactEmail ? true : undefined}
          onChange={(event) => onChange("contactEmail", event.target.value)}
        />
        {errors.contactEmail ? (
          <p className="text-destructive text-sm">{errors.contactEmail}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.proposedContribution}>
          Proposed contribution (optional)
        </Label>
        <Input
          id={ids.proposedContribution}
          value={values.proposedContribution}
          disabled={disabled}
          placeholder="e.g. Co-branded media placement, 5,000 ETB in kind"
          onChange={(event) =>
            onChange("proposedContribution", event.target.value)
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.followUpAt}>Next follow-up (optional)</Label>
        <Input
          id={ids.followUpAt}
          type="date"
          value={values.followUpAt}
          disabled={disabled}
          onChange={(event) => onChange("followUpAt", event.target.value)}
        />
      </div>

      <fieldset className="border-border space-y-4 border-t pt-4">
        <legend className="text-sm font-medium">Partnership</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.partnershipName}>
              Partnership name (optional)
            </Label>
            <Input
              id={ids.partnershipName}
              value={values.partnershipName}
              disabled={disabled}
              maxLength={200}
              onChange={(event) =>
                onChange("partnershipName", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.partnershipType}>Type (optional)</Label>
            <select
              id={ids.partnershipType}
              value={values.partnershipType}
              disabled={disabled}
              className={SELECT_CLASS}
              onChange={(event) =>
                onChange("partnershipType", event.target.value)
              }
            >
              <option value="">Not set</option>
              {Object.entries(PARTNERSHIP_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.campaignId}>Related campaign (optional)</Label>
          <select
            id={ids.campaignId}
            value={values.campaignId}
            disabled={disabled}
            className={SELECT_CLASS}
            onChange={(event) => onChange("campaignId", event.target.value)}
          >
            <option value="">No campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.agreementDetails}>
            Agreement details (optional)
          </Label>
          <textarea
            id={ids.agreementDetails}
            rows={3}
            maxLength={5000}
            value={values.agreementDetails}
            disabled={disabled}
            className={TEXTAREA_CLASS}
            onChange={(event) =>
              onChange("agreementDetails", event.target.value)
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.agreementStartOn}>Starts (optional)</Label>
            <Input
              id={ids.agreementStartOn}
              type="date"
              value={values.agreementStartOn}
              disabled={disabled}
              onChange={(event) =>
                onChange("agreementStartOn", event.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.agreementEndOn}>Ends (optional)</Label>
            <Input
              id={ids.agreementEndOn}
              type="date"
              value={values.agreementEndOn}
              disabled={disabled}
              aria-invalid={errors.agreementEndOn ? true : undefined}
              onChange={(event) =>
                onChange("agreementEndOn", event.target.value)
              }
            />
            {errors.agreementEndOn ? (
              <p className="text-destructive text-sm">
                {errors.agreementEndOn}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-2">
            <Label htmlFor={ids.agreedValueAmount}>
              Agreed value (optional)
            </Label>
            <Input
              id={ids.agreedValueAmount}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={values.agreedValueAmount}
              disabled={disabled}
              onChange={(event) =>
                onChange("agreedValueAmount", event.target.value)
              }
            />
            <p className="text-muted-foreground text-xs">
              A commitment from the partner. It is never counted as spending.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.agreedValueCurrency}>Currency</Label>
            <Input
              id={ids.agreedValueCurrency}
              value={values.agreedValueCurrency}
              disabled={disabled}
              maxLength={3}
              placeholder="ETB"
              aria-invalid={errors.agreedValueCurrency ? true : undefined}
              onChange={(event) =>
                onChange(
                  "agreedValueCurrency",
                  event.target.value.toUpperCase(),
                )
              }
            />
            {errors.agreedValueCurrency ? (
              <p className="text-destructive text-sm">
                {errors.agreedValueCurrency}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor={ids.notes}>Notes (optional)</Label>
        <textarea
          id={ids.notes}
          rows={3}
          value={values.notes}
          disabled={disabled}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => onChange("notes", event.target.value)}
        />
      </div>
    </div>
  );
}
