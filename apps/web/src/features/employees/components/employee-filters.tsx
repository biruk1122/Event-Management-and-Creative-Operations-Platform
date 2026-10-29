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
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  type EmploymentStatus,
  type EmploymentType,
} from "../lib/employees-types";

const ALL = "ALL";

export interface EmployeeDepartmentOption {
  id: string;
  name: string;
}

interface EmployeeFiltersProps {
  search: string;
  departmentId: string | null;
  employmentType: EmploymentType | null;
  employmentStatus: EmploymentStatus | null;
  departments: readonly EmployeeDepartmentOption[];
  onSearchChange: (value: string) => void;
  onDepartmentChange: (value: string | null) => void;
  onEmploymentTypeChange: (value: EmploymentType | null) => void;
  onEmploymentStatusChange: (value: EmploymentStatus | null) => void;
}

export function EmployeeFilters({
  search,
  departmentId,
  employmentType,
  employmentStatus,
  departments,
  onSearchChange,
  onDepartmentChange,
  onEmploymentTypeChange,
  onEmploymentStatusChange,
}: EmployeeFiltersProps) {
  const searchId = useId();
  const departmentFilterId = useId();
  const typeId = useId();
  const statusId = useId();

  return (
    <div
      data-admin-filters
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="flex-1 space-y-2 sm:min-w-56">
        <Label htmlFor={searchId}>Search</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Name, employee ID, email, or phone"
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2 sm:w-48">
        <Label htmlFor={departmentFilterId}>Department</Label>
        <Select
          value={departmentId ?? ALL}
          onValueChange={(value) =>
            onDepartmentChange(value === ALL ? null : value)
          }
        >
          <SelectTrigger
            id={departmentFilterId}
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

      <div className="space-y-2 sm:w-44">
        <Label htmlFor={typeId}>Employment type</Label>
        <Select
          value={employmentType ?? ALL}
          onValueChange={(value) =>
            onEmploymentTypeChange(
              value === ALL ? null : (value as EmploymentType),
            )
          }
        >
          <SelectTrigger id={typeId} aria-label="Filter by employment type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {EMPLOYMENT_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {EMPLOYMENT_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 sm:w-44">
        <Label htmlFor={statusId}>Status</Label>
        <Select
          value={employmentStatus ?? ALL}
          onValueChange={(value) =>
            onEmploymentStatusChange(
              value === ALL ? null : (value as EmploymentStatus),
            )
          }
        >
          <SelectTrigger id={statusId} aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {EMPLOYMENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {EMPLOYMENT_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
