"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useSmsConnectionTest,
  useSmsSettings,
  useUpdateSmsSettings,
} from "../api/sms-queries";
import { categoryLabel } from "../lib/sms-labels";
import { SmsConfirmDialog } from "./sms-confirm-dialog";

type PendingChange =
  { kind: "global" } | { kind: "category"; category: string };

export function SmsSettingsPanel({ canUpdate }: { canUpdate: boolean }) {
  const settings = useSmsSettings();
  const update = useUpdateSmsSettings();
  const connection = useSmsConnectionTest();
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<PendingChange | null>(null);

  if (settings.isPending) {
    return <p role="status">Loading SMS settings...</p>;
  }
  if (settings.isError) {
    return (
      <div role="alert">
        <p>{settings.error.message}</p>
        <Button variant="outline" onClick={() => void settings.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = settings.data;
  const busy = update.isPending;

  const apply = (
    body: { globalEnabled?: boolean; categories?: Record<string, boolean> },
    message: string,
  ) => {
    setAnnouncement("");
    update.mutate(body, {
      onSuccess: () => setAnnouncement(message),
      onSettled: () => setPending(null),
    });
  };

  const requestGlobal = (globalEnabled: boolean) => {
    if (globalEnabled) setPending({ kind: "global" });
    else apply({ globalEnabled: false }, "SMS delivery is off.");
  };

  const requestCategory = (category: string, enabled: boolean) => {
    if (enabled) setPending({ kind: "category", category });
    else
      apply(
        { categories: { [category]: false } },
        `${categoryLabel(category)} is off.`,
      );
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === "global") {
      apply({ globalEnabled: true }, "SMS delivery is on.");
    } else {
      apply(
        { categories: { [pending.category]: true } },
        `${categoryLabel(pending.category)} is on.`,
      );
    }
  };

  const enabledCategories = data.categories
    .filter((row) => row.enabled)
    .map((row) => categoryLabel(row.category));

  return (
    <div className="grid gap-8">
      <section aria-labelledby="sms-delivery-heading" className="grid gap-3">
        <h2 id="sms-delivery-heading" className="text-lg font-semibold">
          Delivery
        </h2>
        <p>
          {data.effectiveEnabled
            ? "SMS is being sent."
            : data.environmentEnabled
              ? "SMS is off. No messages will be sent until it is switched on here."
              : "The environment switch is off. No SMS will be sent, whatever is set here."}
        </p>
        {!data.environmentEnabled ? (
          <p role="note" className="text-sm">
            The environment switch (AFROMESSAGE_ENABLED) overrides every setting
            on this page.
          </p>
        ) : null}
        {canUpdate ? (
          <div>
            {data.globalEnabled ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => requestGlobal(false)}
              >
                Switch SMS delivery off
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => requestGlobal(true)}>
                Switch SMS delivery on
              </Button>
            )}
          </div>
        ) : null}
        {update.isError ? (
          <p role="alert" className="text-sm">
            {update.error.message}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="sms-categories-heading" className="grid gap-3">
        <h2 id="sms-categories-heading" className="text-lg font-semibold">
          Categories
        </h2>
        <p className="text-sm">
          Turning a category off stops it at send time. Turning it on needs
          confirmation.
        </p>
        <ul className="grid gap-2">
          {data.categories.map((row) => (
            <li key={row.category} className="flex items-center gap-3">
              <Checkbox
                id={`sms-category-${row.category}`}
                checked={row.enabled}
                disabled={!canUpdate || busy}
                onCheckedChange={(checked) =>
                  requestCategory(row.category, checked === true)
                }
              />
              <label htmlFor={`sms-category-${row.category}`}>
                {categoryLabel(row.category)}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sms-provider-heading" className="grid gap-3">
        <h2 id="sms-provider-heading" className="text-lg font-semibold">
          Provider
        </h2>
        <p className="text-sm">
          Configured: API key {data.provider.apiKeyConfigured ? "yes" : "no"},
          sender {data.provider.senderConfigured ? "yes" : "no"}, callback{" "}
          {data.provider.callbackConfigured ? "yes" : "no"}. Secret values are
          never shown.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!canUpdate || connection.isPending}
            onClick={() => connection.mutate()}
          >
            Check connection
          </Button>
          <span className="text-sm">No SMS is sent by this check.</span>
        </div>
        {connection.isSuccess ? (
          <p role="status" className="text-sm">
            {connection.data.ok
              ? `Connected. Balance ${connection.data.balance ?? "unknown"}.`
              : `The connection check failed${connection.data.reason ? `: ${connection.data.reason}` : "."}`}
          </p>
        ) : null}
        {connection.isError ? (
          <p role="alert" className="text-sm">
            {connection.error.message}
          </p>
        ) : null}
      </section>

      <SmsConfirmDialog
        open={pending !== null}
        pending={busy}
        title={
          pending?.kind === "category"
            ? `Turn on ${categoryLabel(pending.category)}?`
            : "Turn on SMS delivery?"
        }
        confirmLabel={
          pending?.kind === "category"
            ? "Turn on category"
            : "Turn on SMS delivery"
        }
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === "category" ? (
          <>
            <p>
              New {categoryLabel(pending.category)} messages will be sent when
              they are due, as long as SMS delivery is on.
            </p>
            {!data.globalEnabled ? (
              <p>
                SMS delivery is off, so nothing will be sent until it is turned
                on.
              </p>
            ) : null}
            <p>
              Messages in this category that were cancelled while it was off are
              not sent again.
            </p>
          </>
        ) : (
          <>
            <p>
              Lela will send real SMS to recipients with valid Ethiopian mobile
              numbers, for every enabled category:{" "}
              {enabledCategories.join(", ") || "none"}.
            </p>
            <p>
              {data.environmentEnabled
                ? "The environment switch is on, so messages will be sent."
                : "The environment switch is off, so nothing will be sent until it is turned on in the environment."}
            </p>
            <p>
              Messages cancelled while SMS delivery was off are not sent again.
              Queued messages in enabled categories will be sent.
            </p>
          </>
        )}
      </SmsConfirmDialog>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
