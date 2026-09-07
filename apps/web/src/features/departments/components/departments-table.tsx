import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  activityOf,
  DEPARTMENT_ACTIVITY_LABELS,
  personName,
} from "../lib/departments-types";
import type { Department } from "../lib/departments-types";

interface DepartmentsTableProps {
  departments: readonly Department[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function StatusBadge({ department }: { department: Department }) {
  const activity = activityOf(department);
  return (
    <Badge variant={activity === "ACTIVE" ? "default" : "secondary"}>
      {DEPARTMENT_ACTIVITY_LABELS[activity]}
    </Badge>
  );
}

function managerLabel(department: Department): string {
  return department.manager ? personName(department.manager) : "Unassigned";
}

export function DepartmentsTable({
  departments,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: DepartmentsTableProps) {
  if (departments.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered
            ? "No departments match these filters"
            : "No departments yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New department button above to add the first one."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Manager
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Employees
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {departments.map((department) => (
              <tr key={department.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(department.id)}
                  >
                    {department.name}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {managerLabel(department)}
                </td>
                <td className="text-muted-foreground px-4 py-3 tabular-nums">
                  {department.employeeCount}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge department={department} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {departments.map((department) => (
          <li
            key={department.id}
            className="border-border rounded-xl border p-4"
          >
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(department.id)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {department.name}
                <StatusBadge department={department} />
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {managerLabel(department)}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {department.employeeCount} employee
                {department.employeeCount === 1 ? "" : "s"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Departments pagination"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
