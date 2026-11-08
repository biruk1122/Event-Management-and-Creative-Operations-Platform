"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSmsRecipientSearch } from "../api/sms-queries";
import type { SmsRecipient } from "../api/sms-gateway";

/**
 * Chooses one user to filter the history by. Results show names and user ids only;
 * phone numbers are never requested or shown.
 */
export function SmsRecipientPicker({
  selected,
  onSelect,
}: {
  selected: SmsRecipient | null;
  onSelect: (recipient: SmsRecipient | null) => void;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const search = useSmsRecipientSearch(query);

  if (selected) {
    return (
      <div className="grid gap-1">
        <span className="text-sm font-medium">Recipient</span>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {selected.name} <span className="text-sm">({selected.id})</span>
          </span>
          <Button variant="outline" onClick={() => onSelect(null)}>
            Clear recipient
          </Button>
        </div>
      </div>
    );
  }

  const term = query.trim();
  return (
    <div className="grid gap-1">
      <Label htmlFor={inputId}>Recipient</Label>
      <Input
        id={inputId}
        value={query}
        placeholder="Search by name, or paste a user ID"
        aria-describedby={`${inputId}-hint`}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p id={`${inputId}-hint`} className="text-sm">
        Type at least two characters.
      </p>
      {term.length >= 2 && search.isPending ? (
        <p role="status" className="text-sm">
          Searching users...
        </p>
      ) : null}
      {term.length >= 2 && search.isError ? (
        <p role="alert" className="text-sm">
          {search.error.message}
        </p>
      ) : null}
      {term.length >= 2 && search.data && search.data.length === 0 ? (
        <p className="text-sm">No users match that search.</p>
      ) : null}
      {term.length >= 2 && search.data && search.data.length > 0 ? (
        <ul aria-label="Matching users" className="grid gap-1">
          {search.data.map((recipient) => (
            <li key={recipient.id}>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start py-2 text-left"
                onClick={() => {
                  onSelect(recipient);
                  setQuery("");
                }}
              >
                <span>
                  {recipient.name}{" "}
                  <span className="text-sm">({recipient.id})</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
