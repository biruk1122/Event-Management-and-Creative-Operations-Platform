import Link from "next/link";
import type { Route } from "next";
import {
  MoreHorizontal,
  Pencil,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { displayName, USER_STATUS_LABELS, type User } from "../lib/users-types";

export interface UserRowPermissions {
  canEdit: boolean;
  canDeactivate: boolean;
  canActivate: boolean;
}

interface UsersTableProps {
  users: readonly User[];
  total: number;
  pageSize: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Shown when a filter is active and nothing matched. */
  filtered: boolean;
  permissions: UserRowPermissions;
  onEdit: (user: User) => void;
  onRequestStatusChange: (user: User) => void;
}

const AVATAR_TONES = [
  "bg-primary/15 text-primary",
  "bg-accent text-accent-foreground",
  "bg-muted text-foreground",
] as const;

/** Initials for the avatar, from the name or the email when no name is set. */
export function initialsFor(
  user: Pick<User, "firstName" | "lastName" | "email">,
) {
  const source = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const base = source || user.email.split("@")[0] || "?";
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function toneFor(id: string) {
  const hash = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export function UserStatusBadge({ status }: { status: User["status"] }) {
  const active = status === "ACTIVE";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-transparent px-2.5 py-0.5 font-medium",
        active
          ? "bg-success-background text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-success" : "bg-muted-foreground",
        )}
      />
      {USER_STATUS_LABELS[status]}
    </Badge>
  );
}

function RowActions({
  user,
  permissions,
  onEdit,
  onRequestStatusChange,
}: {
  user: User;
  permissions: UserRowPermissions;
  onEdit: (user: User) => void;
  onRequestStatusChange: (user: User) => void;
}) {
  const isSuperAdmin = user.role?.name === "Super Admin";
  const canToggle =
    user.status === "ACTIVE"
      ? permissions.canDeactivate
      : permissions.canActivate;
  const detailsHref = `/users/${user.id}` as Route;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Actions for ${displayName(user)}`}
          className="size-9 rounded-lg"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <Link href={detailsHref}>View details</Link>
        </DropdownMenuItem>
        {permissions.canEdit ? (
          <DropdownMenuItem onSelect={() => onEdit(user)}>
            <Pencil aria-hidden="true" />
            Edit user
          </DropdownMenuItem>
        ) : null}
        {canToggle ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={
                user.status === "ACTIVE"
                  ? "text-destructive focus:text-destructive"
                  : undefined
              }
              disabled={isSuperAdmin && user.status === "ACTIVE"}
              onSelect={() => onRequestStatusChange(user)}
            >
              {user.status === "ACTIVE" ? (
                <UserRoundX aria-hidden="true" />
              ) : (
                <UserRoundCheck aria-hidden="true" />
              )}
              {user.status === "ACTIVE" ? "Deactivate user" : "Activate user"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Page numbers to show: the current page with its neighbours, plus the ends. */
export function pageWindow(
  page: number,
  pageCount: number,
): (number | "gap")[] {
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (const value of sorted) {
    const last = result[result.length - 1];
    if (typeof last === "number" && value - last > 1) result.push("gap");
    result.push(value);
  }
  return result;
}

export function UsersTable({
  users,
  total,
  pageSize,
  page,
  pageCount,
  onPageChange,
  filtered,
  permissions,
  onEdit,
  onRequestStatusChange,
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

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Tablet and desktop: a data table. */}
      <div className="border-border bg-card hidden overflow-x-auto rounded-xl border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-xs">
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
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/40">
                <th scope="row" className="px-4 py-3 font-normal">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        toneFor(user.id),
                      )}
                    >
                      {initialsFor(user)}
                    </span>
                    <span className="flex flex-col">
                      <Link
                        href={`/users/${user.id}` as Route}
                        className="focus-visible:ring-ring/50 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                      >
                        {displayName(user)}
                      </Link>
                      {user.mustChangePassword ? (
                        <span className="text-muted-foreground text-xs">
                          Password pending
                        </span>
                      ) : null}
                    </span>
                  </div>
                </th>
                <td className="text-muted-foreground max-w-xs truncate px-4 py-3">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  {user.role?.name ?? (
                    <span className="text-muted-foreground">No role</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <UserStatusBadge status={user.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <RowActions
                    user={user}
                    permissions={permissions}
                    onEdit={onEdit}
                    onRequestStatusChange={onRequestStatusChange}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: a stacked card list. */}
      <ul className="space-y-3 sm:hidden">
        {users.map((user) => (
          <li
            key={user.id}
            className="border-border bg-card flex items-start gap-3 rounded-xl border p-4"
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                toneFor(user.id),
              )}
            >
              {initialsFor(user)}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <Link
                href={`/users/${user.id}` as Route}
                className="focus-visible:ring-ring/50 block truncate rounded text-sm font-medium focus-visible:ring-3 focus-visible:outline-none"
              >
                {displayName(user)}
              </Link>
              <span className="text-muted-foreground block truncate text-sm">
                {user.email}
              </span>
              <span className="text-muted-foreground block text-sm">
                {user.role?.name ?? "No role"}
              </span>
              <UserStatusBadge status={user.status} />
            </div>
            <RowActions
              user={user}
              permissions={permissions}
              onEdit={onEdit}
              onRequestStatusChange={onRequestStatusChange}
            />
          </li>
        ))}
      </ul>

      {pageCount > 1 ? (
        <nav
          aria-label="Users pagination"
          className="flex flex-col items-center justify-between gap-3 sm:flex-row"
        >
          <p className="text-muted-foreground text-sm">
            Showing {from}–{to} of {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="size-9"
            >
              ‹
            </Button>
            {pageWindow(page, pageCount).map((entry, index) =>
              entry === "gap" ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden="true"
                  className="text-muted-foreground px-1"
                >
                  …
                </span>
              ) : (
                <Button
                  key={entry}
                  type="button"
                  variant={entry === page ? "default" : "outline"}
                  size="icon"
                  aria-label={`Page ${entry}`}
                  aria-current={entry === page ? "page" : undefined}
                  onClick={() => onPageChange(entry)}
                  className="size-9"
                >
                  {entry}
                </Button>
              ),
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
              className="size-9"
            >
              ›
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
