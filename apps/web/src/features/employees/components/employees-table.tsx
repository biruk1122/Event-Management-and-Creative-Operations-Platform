import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  displayName,
  employmentDuration,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  type Employee,
} from "../lib/employees-types";

interface EmployeesTableProps {
  employees: readonly Employee[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function StatusBadge({ status }: { status: Employee["employmentStatus"] }) {
  return (
    <Badge
      variant={
        status === "ACTIVE"
          ? "default"
          : status === "ON_LEAVE"
            ? "outline"
            : "secondary"
      }
    >
      {EMPLOYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function EmployeesTable({
  employees,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: EmployeesTableProps) {
  if (employees.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No employees match these filters" : "No employees yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the Register Employee button above to add the first one."}
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
                Employee ID
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Department
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Position
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Type
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Work location
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Duration
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {employees.map((employee) => (
              <tr key={employee.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(employee.id)}
                  >
                    {employee.employeeCode}
                  </button>
                </th>
                <td className="text-muted-foreground px-4 py-3">
                  {displayName(employee)}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {employee.departmentName ?? "—"}
                </td>
                <td className="text-muted-foreground max-w-xs truncate px-4 py-3">
                  {employee.position}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {EMPLOYMENT_TYPE_LABELS[employee.employmentType]}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {employee.workLocation ?? "—"}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {employmentDuration(employee.employmentDate)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={employee.employmentStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {employees.map((employee) => (
          <li key={employee.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(employee.id)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {employee.employeeCode}
                <StatusBadge status={employee.employmentStatus} />
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {displayName(employee)} · {employee.position}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {employee.departmentName ?? "No department"} ·{" "}
                {EMPLOYMENT_TYPE_LABELS[employee.employmentType]}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Employees pagination"
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
