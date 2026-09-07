import { Badge } from "@/components/ui/badge";

import type { Role } from "../lib/rbac-types";

interface RolesTableProps {
  roles: readonly Role[];
  onSelect: (id: string) => void;
}

export function RolesTable({ roles, onSelect }: RolesTableProps) {
  if (roles.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">No roles yet</p>
        <p className="text-muted-foreground mt-1 text-sm">
          No configurable roles are available.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Tablet and desktop: a data table. */}
      <div className="border-border hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border border-b text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Description
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Grants
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {roles.map((role) => (
              <tr key={role.id} className="hover:bg-muted/50">
                <th scope="row" className="px-4 py-3 font-normal">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(role.id)}
                  >
                    {role.name}
                  </button>
                  {role.isSystem ? (
                    <Badge variant="secondary" className="ml-2 align-middle">
                      System
                    </Badge>
                  ) : null}
                </th>
                <td
                  className="text-muted-foreground max-w-xs truncate px-4 py-3"
                  title={role.description ?? undefined}
                >
                  {role.description ?? "—"}
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  <button
                    type="button"
                    className="focus-visible:ring-ring/50 rounded underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                    onClick={() => onSelect(role.id)}
                  >
                    View grants
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {roles.map((role) => (
          <li key={role.id} className="border-border rounded-xl border p-4">
            <button
              type="button"
              className="focus-visible:ring-ring/50 block w-full rounded text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onSelect(role.id)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {role.name}
                {role.isSystem ? (
                  <Badge variant="secondary">System</Badge>
                ) : null}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {role.description ?? "No description"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
