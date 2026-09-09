"use client";

import { useId } from "react";
import { Search } from "lucide-react";

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
  WORKSPACE_KIND_LABELS,
  type WorkspaceKind,
} from "../lib/workspaces-types";

interface WorkspaceFiltersProps {
  kind: WorkspaceKind;
  /** The kinds the caller may read; the list is fetched one kind at a time. */
  kinds: readonly WorkspaceKind[];
  search: string;
  onKindChange: (kind: WorkspaceKind) => void;
  onSearchChange: (search: string) => void;
}

export function WorkspaceFilters({
  kind,
  kinds,
  search,
  onKindChange,
  onSearchChange,
}: WorkspaceFiltersProps) {
  const kindId = useId();
  const searchId = useId();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="space-y-2 sm:w-48">
        <Label htmlFor={kindId}>Kind</Label>
        <Select
          value={kind}
          onValueChange={(value) => onKindChange(value as WorkspaceKind)}
          disabled={kinds.length <= 1}
        >
          <SelectTrigger id={kindId} aria-label="Workspace kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((value) => (
              <SelectItem key={value} value={value}>
                {WORKSPACE_KIND_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-2">
        <Label htmlFor={searchId}>Search</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Manager name or email on this page"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
