"use client";

import { useId, type ReactNode } from "react";
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
  personName,
  TALENT_AVAILABILITIES,
  TALENT_AVAILABILITY_LABELS,
  TALENT_SORT_LABELS,
  TALENT_TYPE_LABELS,
  TALENT_TYPES,
  type AssignableUser,
  type TalentAssignmentFilter,
  type TalentAvailability,
  type TalentSort,
  type TalentType,
} from "../lib/talent-types";

const ALL = "ALL";
const SORTS: readonly TalentSort[] = ["name", "newest", "availability"];

interface TalentFiltersProps {
  type: TalentType | null;
  availability: TalentAvailability | null;
  managerId: string | null;
  assignment: TalentAssignmentFilter | null;
  sort: TalentSort;
  search: string;
  managers: readonly AssignableUser[];
  /** The page's primary action, such as Add Talent, placed at the end of the toolbar. */
  action?: ReactNode;
  onTypeChange: (type: TalentType | null) => void;
  onAvailabilityChange: (availability: TalentAvailability | null) => void;
  onManagerChange: (managerId: string | null) => void;
  onAssignmentChange: (assignment: TalentAssignmentFilter | null) => void;
  onSortChange: (sort: TalentSort) => void;
  onSearchChange: (search: string) => void;
}

/**
 * The directory toolbar: one search box and compact selects, with the
 * page's action at the end. Each control keeps a visible-to-screen-readers
 * label; the compact layout shows only the chosen value.
 */
export function TalentFilters({
  type,
  availability,
  managerId,
  assignment,
  sort,
  search,
  managers,
  action,
  onTypeChange,
  onAvailabilityChange,
  onManagerChange,
  onAssignmentChange,
  onSortChange,
  onSearchChange,
}: TalentFiltersProps) {
  const typeId = useId();
  const availabilityId = useId();
  const managerId_ = useId();
  const assignmentId = useId();
  const sortId = useId();
  const searchId = useId();

  const selectClass = "h-10 w-auto min-w-40 bg-card";

  return (
    <div
      data-work-filters
      className="border-border bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-3 shadow-sm"
    >
      <div className="relative min-w-60 flex-1">
        <Label htmlFor={searchId} className="sr-only">
          Search
        </Label>
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          id={searchId}
          type="search"
          placeholder="Search by name, role or manager…"
          className="bg-card h-10 pl-9"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <Label htmlFor={typeId} className="sr-only">
        Type
      </Label>
      <Select
        value={type ?? ALL}
        onValueChange={(value) =>
          onTypeChange(value === ALL ? null : (value as TalentType))
        }
      >
        <SelectTrigger
          id={typeId}
          aria-label="Filter by type"
          className={selectClass}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {TALENT_TYPES.map((value) => (
            <SelectItem key={value} value={value}>
              {TALENT_TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Label htmlFor={availabilityId} className="sr-only">
        Availability
      </Label>
      <Select
        value={availability ?? ALL}
        onValueChange={(value) =>
          onAvailabilityChange(
            value === ALL ? null : (value as TalentAvailability),
          )
        }
      >
        <SelectTrigger
          id={availabilityId}
          aria-label="Filter by availability"
          className={selectClass}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All availability</SelectItem>
          {TALENT_AVAILABILITIES.map((value) => (
            <SelectItem key={value} value={value}>
              {TALENT_AVAILABILITY_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Label htmlFor={assignmentId} className="sr-only">
        Assignment
      </Label>
      <Select
        value={assignment ?? ALL}
        onValueChange={(value) =>
          onAssignmentChange(
            value === ALL ? null : (value as TalentAssignmentFilter),
          )
        }
      >
        <SelectTrigger
          id={assignmentId}
          aria-label="Filter by assignment"
          className={selectClass}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Assigned or not</SelectItem>
          <SelectItem value="assigned">Currently assigned</SelectItem>
          <SelectItem value="unassigned">Not assigned</SelectItem>
        </SelectContent>
      </Select>

      <Label htmlFor={managerId_} className="sr-only">
        Manager
      </Label>
      <Select
        value={managerId ?? ALL}
        onValueChange={(value) => onManagerChange(value === ALL ? null : value)}
      >
        <SelectTrigger
          id={managerId_}
          aria-label="Filter by manager"
          className={selectClass}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All managers</SelectItem>
          {managers.map((manager) => (
            <SelectItem key={manager.id} value={manager.id}>
              {personName(manager)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Label htmlFor={sortId} className="sr-only">
        Sort by
      </Label>
      <Select
        value={sort}
        onValueChange={(value) => onSortChange(value as TalentSort)}
      >
        <SelectTrigger
          id={sortId}
          aria-label="Sort talent"
          className={selectClass}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((value) => (
            <SelectItem key={value} value={value}>
              {TALENT_SORT_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}
