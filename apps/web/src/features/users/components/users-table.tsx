import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { displayName, USER_STATUS_LABELS } from "../lib/users-types";
import type { User } from "../lib/users-types";

interface UsersTableProps {
  users: readonly User[];
  onSelect: (id: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
}

function StatusBadge({ status }: { status: User["status"] }) {
  return (
    <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>
      {USER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function UsersTable({
  users,
  onSelect,
  page,
  pageCount,
  onPageChange,
  filtered,
}: UsersTableProps) {
  if (users.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">
          {filtered ? "No users match these filters" : "No users yet"}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {filtered
            ? "Clear the filters or adjust your search."
            : "Use the New user button above to add the first one."}
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
                Email
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Role
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(user.id)}
                  >
                    {displayName(user)}
                  </button>
                  {user.mustChangePassword ? (
                    <Badge variant="outline" className="ml-2 align-middle">
                      Password pending
                    </Badge>
                  ) : null}
                </th>
                <td className="text-muted-foreground max-w-xs truncate px-4 py-3">
                  {user.email}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {user.role?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {users.map((user) => (
          <li key={user.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(user.id)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {displayName(user)}
                <StatusBadge status={user.status} />
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {user.email}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {user.role?.name ?? "No role"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Users pagination"
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
