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
  TEAM_ACTIVITIES,
  TEAM_ACTIVITY_LABELS,
  type AssignableDepartment,
  type TeamActivity,
} from "../lib/teams-types";

const ALL = "ALL";

interface TeamFiltersProps {
  status: TeamActivity | null;
  departmentId: string | null;
  search: string;
  departments: readonly AssignableDepartment[];
  onStatusChange: (status: TeamActivity | null) => void;
  onDepartmentChange: (departmentId: string | null) => void;
  onSearchChange: (search: string) => void;
}

export function TeamFilters({
  status,
  departmentId,
  search,
  departments,
  onStatusChange,
  onDepartmentChange,
  onSearchChange,
}: TeamFiltersProps) {
  const statusId = useId();
  const departmentSelectId = useId();
  const searchId = useId();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="space-y-2 sm:w-40">
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) =>
            onStatusChange(value === ALL ? null : (value as TeamActivity))
          }
        >
          <SelectTrigger id={statusId} aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TEAM_ACTIVITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {TEAM_ACTIVITY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 sm:w-52">
        <Label htmlFor={departmentSelectId}>Department</Label>
        <Select
          value={departmentId ?? ALL}
          onValueChange={(value) =>
            onDepartmentChange(value === ALL ? null : value)
          }
        >
          <SelectTrigger
            id={departmentSelectId}
            aria-label="Filter by department"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
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
            placeholder="Name or manager"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
