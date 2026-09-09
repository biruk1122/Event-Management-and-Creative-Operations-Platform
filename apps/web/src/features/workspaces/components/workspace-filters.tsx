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
  WORKSPACE_KINDS,
  WORKSPACE_KIND_LABELS,
  type WorkspaceKind,
} from "../lib/workspaces-types";

const ALL = "ALL";

interface WorkspaceFiltersProps {
  kind: WorkspaceKind | null;
  search: string;
  onKindChange: (kind: WorkspaceKind | null) => void;
  onSearchChange: (search: string) => void;
}

export function WorkspaceFilters({
  kind,
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
          value={kind ?? ALL}
          onValueChange={(value) =>
            onKindChange(value === ALL ? null : (value as WorkspaceKind))
          }
        >
          <SelectTrigger id={kindId} aria-label="Filter by kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All kinds</SelectItem>
            {WORKSPACE_KINDS.map((value) => (
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
            placeholder="Manager name or email"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
