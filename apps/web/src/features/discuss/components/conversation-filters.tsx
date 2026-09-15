"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConversationFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export function ConversationFilters({
  search,
  onSearchChange,
}: ConversationFiltersProps) {
  const searchId = useId();
  return (
    <div className="flex-1 space-y-1">
      <Label htmlFor={searchId} className="sr-only">
        Search
      </Label>
      <Input
        id={searchId}
        type="search"
        placeholder="Search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="max-w-xs"
      />
    </div>
  );
}
