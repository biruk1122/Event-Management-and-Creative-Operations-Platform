"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchRecipients } from "../api/sharing-gateway";
import type { ShareRecipientOption } from "../lib/sharing-types";

export function EmployeeRecipientPicker({
  value,
  onChange,
  disabled,
}: {
  value: ShareRecipientOption | null;
  onChange: (value: ShareRecipientOption) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const candidates = useQuery({
    queryKey: ["share-recipients", debouncedSearch],
    queryFn: ({ signal }) => searchRecipients(debouncedSearch, signal),
    enabled: open,
    retry: false,
  });
  const searching = search !== debouncedSearch || candidates.isFetching;

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-recipient-option]",
      ),
    );
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      current < 0
        ? event.key === "ArrowDown"
          ? 0
          : buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length;
    buttons[next]?.focus();
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Employee</Label>
      {/* Give the portalled dropdown its own scroll lock inside the modal dialog. */}
      <Popover modal open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-auto min-h-11 w-full justify-between gap-2 text-left"
            aria-label={value ? `Employee: ${value.name}` : "Select employee"}
          >
            <UserRound aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {value ? value.name : "Select an employee"}
              {value ? (
                <span className="text-muted-foreground block truncate text-xs font-normal">
                  {value.email}
                </span>
              ) : null}
            </span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          aria-label="Choose employee"
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] rounded-xl p-2"
          onKeyDown={moveFocus}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <Label htmlFor={`${id}-search`} className="sr-only">
            Find an employee
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              id={`${id}-search`}
              type="search"
              placeholder="Search by name or email"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto" aria-busy={searching}>
            {searching ? (
              <p role="status" className="text-muted-foreground p-3 text-sm">
                Searching…
              </p>
            ) : candidates.isError ? (
              <div role="alert" className="space-y-2 p-3 text-sm">
                <p>We could not load employees.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void candidates.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : !candidates.data?.length ? (
              <p role="status" className="text-muted-foreground p-3 text-sm">
                No employees found.
              </p>
            ) : (
              <ul aria-label="Matching employees" className="space-y-1">
                {candidates.data.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      data-recipient-option
                      type="button"
                      className="hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring flex w-full items-center gap-2 rounded-lg p-3 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
                      onClick={() => {
                        onChange(candidate);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {candidate.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {candidate.email}
                        </span>
                      </span>
                      {value?.id === candidate.id ? (
                        <Check aria-hidden="true" className="size-4 shrink-0" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
