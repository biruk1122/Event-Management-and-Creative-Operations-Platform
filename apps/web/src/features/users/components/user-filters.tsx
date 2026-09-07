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
  USER_STATUSES,
  USER_STATUS_LABELS,
  type UserStatus,
} from "../lib/users-types";

const ALL = "ALL";

interface UserFiltersProps {
  status: UserStatus | null;
  search: string;
  onStatusChange: (status: UserStatus | null) => void;
  onSearchChange: (search: string) => void;
}

export function UserFilters({
  status,
  search,
  onStatusChange,
  onSearchChange,
}: UserFiltersProps) {
  const statusId = useId();
  const searchId = useId();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="space-y-2 sm:w-48">
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) =>
            onStatusChange(value === ALL ? null : (value as UserStatus))
          }
        >
          <SelectTrigger id={statusId} aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {USER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {USER_STATUS_LABELS[value]}
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
            placeholder="Name or email"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
