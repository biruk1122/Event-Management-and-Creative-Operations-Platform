"use client";

import { useId } from "react";
import { Search } from "lucide-react";

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
    <div className="relative flex-1">
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
      />
      <Label htmlFor={searchId} className="sr-only">
        Search
      </Label>
      <Input
        id={searchId}
        type="search"
        placeholder="Search conversations…"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="bg-muted/60 h-11 rounded-full border-transparent pl-10"
      />
    </div>
  );
}
