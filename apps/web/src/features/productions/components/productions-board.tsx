"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ProductionForm, type ProductionValues } from "./production-form";
import type { ProductionArea } from "../lib/production-access";
import {
  nextProductionStatuses,
  productionDate,
  productionPersonName,
  productionStatusLabel,
  type Production,
  type ProductionStatus,
} from "../lib/production-types";

const defaultAreas: ProductionArea[] = [
  "Overview",
  "Team",
  "Talent",
  "Tasks",
  "Calendar",
  "Discussion",
  "Meetings",
  "Files",
  "Reports",
];
const destinations: Partial<Record<ProductionArea, Route>> = {
  Team: "/teams",
  Talent: "/talent",
  Tasks: "/tasks",
  Calendar: "/calendar",
  Discussion: "/discuss/channels" as Route,
  Meetings: "/meetings",
};

export interface ProductionsBoardProps {
  productions: readonly Production[];
  state: "loading" | "ready" | "error" | "denied";
  onRetry?: () => void;
  refreshing?: boolean;
  total?: number;
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  searchValue?: string;
  statusValue?: ProductionStatus | "ALL";
  onSearchChange?: (value: string) => void;
  onStatusChange?: (value: ProductionStatus | "ALL") => void;
  onClearFilters?: () => void;
  onSelect?: (id: string) => void;
  onCloseDetails?: () => void;
  selectedProduction?: Production | undefined;
  detailLoading?: boolean;
  detailError?: string | null;
  onDetailRetry?: () => void;
  areas?: readonly ProductionArea[];
  canCreate?: boolean;
  canUpdate?: boolean;
  canTransition?: boolean;
  canAssign?: boolean;
  canDelete?: boolean;
  availablePeople?: readonly NonNullable<Production["manager"]>[];
  peopleUnavailable?: boolean;
  availableTeams?: readonly Production["teams"][number][];
  teamsUnavailable?: boolean;
  availableTalents?: readonly Production["talents"][number]["talent"][];
  talentsUnavailable?: boolean;
  onCreate?: (values: ProductionValues) => Promise<void>;
  onUpdate?: (id: string, values: ProductionValues) => Promise<void>;
  onTransition?: (id: string, status: ProductionStatus) => Promise<void>;
  onAssignManager?: (id: string, userId: string | null) => Promise<void>;
  onAssignTeam?: (id: string, teamId: string) => Promise<void>;
  onRemoveTeam?: (id: string, teamId: string) => Promise<void>;
  onAddMember?: (id: string, userId: string) => Promise<void>;
  onRemoveMember?: (id: string, userId: string) => Promise<void>;
  onAssignTalent?: (
    id: string,
    talentId: string,
    role: string,
  ) => Promise<void>;
  onRemoveTalent?: (id: string, talentId: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const badgeVariant: Record<
  ProductionStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  PLANNED: "secondary",
  ACTIVE: "default",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

function editValues(production: Production): ProductionValues {
  return {
    name: production.name,
    productionType: production.productionType,
    description: production.description ?? "",
    startAt: production.startAt?.slice(0, 10) ?? "",
    endAt: production.endAt?.slice(0, 10) ?? "",
    deadlineAt: production.deadlineAt?.slice(0, 10) ?? "",
  };
}

export function ProductionsBoard({
  productions,
  state,
  onRetry,
  refreshing,
  total,
  page = 1,
  pageCount = 1,
  onPageChange,
  searchValue,
  statusValue,
  onSearchChange,
  onStatusChange,
  onClearFilters,
  onSelect,
  onCloseDetails,
  selectedProduction,
  detailLoading,
  detailError,
  onDetailRetry,
  areas = defaultAreas,
  canCreate,
  canUpdate,
  canTransition,
  canAssign,
  canDelete,
  availablePeople = [],
  peopleUnavailable,
  availableTeams = [],
  teamsUnavailable,
  availableTalents = [],
  talentsUnavailable,
  onCreate,
  onUpdate,
  onTransition,
  onAssignManager,
  onAssignTeam,
  onRemoveTeam,
  onAddMember,
  onRemoveMember,
  onAssignTalent,
  onRemoveTalent,
  onDelete,
}: ProductionsBoardProps) {
  const [localSearch, setLocalSearch] = useState("");
  const [localStatus, setLocalStatus] = useState<ProductionStatus | "ALL">(
    "ALL",
  );
  const search = searchValue ?? localSearch;
  const status = statusValue ?? localStatus;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<"create" | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [activeArea, setActiveArea] = useState<ProductionArea>("Overview");
  const [talentId, setTalentId] = useState("");
  const [talentRole, setTalentRole] = useState("");

  const selected = onSelect
    ? selectedProduction
    : productions.find((item) => item.id === selectedId);
  const filtered =
    onSearchChange || onStatusChange
      ? productions
      : productions.filter(
          (item) =>
            (status === "ALL" || item.status === status) &&
            `${item.name} ${item.productionType}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        );

  async function perform(
    action: () => Promise<void>,
    success: string,
  ): Promise<boolean> {
    setBusy(true);
    setActionError("");
    try {
      await action();
      setAnnouncement(success);
      setConfirmDelete(false);
      return true;
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "We could not complete that action. Try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p role="status">Loading productions…</p>;
  if (state === "denied")
    return <p role="alert">You do not have access to this area.</p>;
  if (state === "error")
    return (
      <div role="alert" className="space-y-2">
        <p>We could not load productions. Try again.</p>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {total ?? productions.length} production
          {(total ?? productions.length) === 1 ? "" : "s"}
        </p>
        {canCreate ? (
          <Button disabled={!onCreate} onClick={() => setForm("create")}>
            New production
          </Button>
        ) : null}
      </div>
      {refreshing ? (
        <p role="status" className="text-muted-foreground text-sm">
          Refreshing productions…
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="production-search">Search productions</Label>
          <Input
            id="production-search"
            value={search}
            onChange={(event) =>
              (onSearchChange ?? setLocalSearch)(event.target.value)
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="production-status">Status</Label>
          <select
            id="production-status"
            value={status}
            onChange={(event) =>
              (onStatusChange ?? setLocalStatus)(
                event.target.value as ProductionStatus | "ALL",
              )
            }
            className="border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
          >
            <option value="ALL">All statuses</option>
            {(Object.keys(productionStatusLabel) as ProductionStatus[]).map(
              (value) => (
                <option key={value} value={value}>
                  {productionStatusLabel[value]}
                </option>
              ),
            )}
          </select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">
            {search || status !== "ALL"
              ? "No productions match these filters"
              : "No productions yet"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {search || status !== "ALL"
              ? "Adjust your search or status filter."
              : canCreate
                ? "Use New production to create the first one."
                : "No production records are available to you."}
          </p>
          {search || status !== "ALL" ? (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                if (onClearFilters) onClearFilters();
                else {
                  setLocalSearch("");
                  setLocalStatus("ALL");
                }
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  onSelect?.(item.id);
                  setConfirmDelete(false);
                  setActionError("");
                  setActiveArea("Overview");
                }}
                aria-current={selectedId === item.id ? "true" : undefined}
                className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 h-full w-full rounded-xl border p-4 text-left focus-visible:ring-3 focus-visible:outline-none"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {item.name}
                  <Badge variant={badgeVariant[item.status]}>
                    {productionStatusLabel[item.status]}
                  </Badge>
                </span>
                <span className="text-muted-foreground mt-2 block text-sm">
                  {item.productionType} · Deadline{" "}
                  {productionDate(item.deadlineAt)}
                </span>
                <span className="text-muted-foreground block text-sm">
                  Manager:{" "}
                  {item.manager
                    ? productionPersonName(item.manager)
                    : "Unassigned"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {onPageChange && pageCount > 1 ? (
        <nav
          aria-label="Production pagination"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
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
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}

      {selectedId && detailLoading ? (
        <p role="status">Loading production details…</p>
      ) : null}
      {selectedId && detailError ? (
        <div role="alert" className="space-y-2">
          <p>{detailError}</p>
          {onDetailRetry ? (
            <Button variant="outline" onClick={onDetailRetry}>
              Try details again
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedId(null);
              onCloseDetails?.();
            }}
          >
            Close details
          </Button>
        </div>
      ) : null}

      {selected ? (
        <section
          aria-label="Production details"
          className="border-border space-y-5 rounded-xl border p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold break-words">
                {selected.name}
              </h2>
              <p className="text-muted-foreground text-sm">
                {selected.productionType}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedId(null);
                onCloseDetails?.();
              }}
            >
              Close details
            </Button>
          </div>
          {actionError ? (
            <p role="alert" className="text-destructive text-sm">
              {actionError}
            </p>
          ) : null}
          <p className="text-sm break-words">
            {selected.description || "No description added."}
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Start", productionDate(selected.startAt)],
                ["End", productionDate(selected.endAt)],
                ["Deadline", productionDate(selected.deadlineAt)],
                [
                  "Manager",
                  selected.manager
                    ? productionPersonName(selected.manager)
                    : "Unassigned",
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <h3 className="font-medium">Teams</h3>
              <p className="text-muted-foreground">
                {selected.teams.length
                  ? selected.teams.map((team) => team.name).join(", ")
                  : "No teams assigned"}
              </p>
            </div>
            <div>
              <h3 className="font-medium">Members</h3>
              <p className="text-muted-foreground">
                {selected.participants.length
                  ? selected.participants.map(productionPersonName).join(", ")
                  : "No members assigned"}
              </p>
            </div>
            <div>
              <h3 className="font-medium">Talent</h3>
              <p className="text-muted-foreground">
                {selected.talents.length
                  ? selected.talents
                      .map(
                        (assignment) =>
                          `${assignment.talent.fullName} (${assignment.role})`,
                      )
                      .join(", ")
                  : "No talent assigned"}
              </p>
            </div>
          </div>
          {canAssign ? (
            <div className="border-border grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="production-manager">Assign manager</Label>
                <select
                  id="production-manager"
                  value={selected.manager?.id ?? ""}
                  disabled={!onAssignManager || busy}
                  onChange={(event) => {
                    if (onAssignManager)
                      void perform(
                        () =>
                          onAssignManager(
                            selected.id,
                            event.target.value || null,
                          ),
                        "Production manager updated.",
                      );
                  }}
                  className="border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
                >
                  <option value="">No manager</option>
                  {(selected.manager &&
                  !availablePeople.some(
                    (person) => person.id === selected.manager?.id,
                  )
                    ? [selected.manager, ...availablePeople]
                    : availablePeople
                  ).map((person) => (
                    <option key={person.id} value={person.id}>
                      {productionPersonName(person)}
                    </option>
                  ))}
                </select>
                {peopleUnavailable ? (
                  <p className="text-muted-foreground text-xs">
                    The user directory is unavailable for your role.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="production-member">Add member</Label>
                <select
                  id="production-member"
                  value=""
                  disabled={!onAddMember || busy}
                  onChange={(event) => {
                    if (onAddMember && event.target.value)
                      void perform(
                        () => onAddMember(selected.id, event.target.value),
                        "Production member added.",
                      );
                  }}
                  className="border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
                >
                  <option value="">Choose a person</option>
                  {availablePeople
                    .filter(
                      (person) =>
                        !selected.participants.some(
                          (member) => member.id === person.id,
                        ),
                    )
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {productionPersonName(person)}
                      </option>
                    ))}
                </select>
                {onRemoveMember && selected.participants.length ? (
                  <ul className="space-y-1 pt-1">
                    {selected.participants.map((person) => (
                      <li
                        key={person.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="break-words">
                          {productionPersonName(person)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void perform(
                              () => onRemoveMember(selected.id, person.id),
                              "Production member removed.",
                            )
                          }
                          aria-label={`Remove ${productionPersonName(person)}`}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
          {canAssign ? (
            <div className="border-border grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="production-team">Assign team</Label>
                <select
                  id="production-team"
                  value=""
                  disabled={!onAssignTeam || busy || teamsUnavailable}
                  onChange={(event) => {
                    if (onAssignTeam && event.target.value)
                      void perform(
                        () => onAssignTeam(selected.id, event.target.value),
                        "Team assigned.",
                      );
                  }}
                  className="border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
                >
                  <option value="">Choose a team</option>
                  {availableTeams
                    .filter(
                      (team) =>
                        !selected.teams.some(
                          (assigned) => assigned.id === team.id,
                        ),
                    )
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                </select>
                {teamsUnavailable ? (
                  <p className="text-muted-foreground text-xs">
                    The team directory is unavailable for your role.
                  </p>
                ) : null}
                {onRemoveTeam ? (
                  <ul className="space-y-1">
                    {selected.teams.map((team) => (
                      <li
                        key={team.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span>{team.name}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          aria-label={`Unassign ${team.name}`}
                          onClick={() =>
                            void perform(
                              () => onRemoveTeam(selected.id, team.id),
                              "Team unassigned.",
                            )
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="production-talent">Assign talent</Label>
                <select
                  id="production-talent"
                  value={talentId}
                  disabled={!onAssignTalent || busy || talentsUnavailable}
                  onChange={(event) => setTalentId(event.target.value)}
                  className="border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
                >
                  <option value="">Choose talent</option>
                  {availableTalents
                    .filter(
                      (talent) =>
                        !selected.talents.some(
                          (assignment) => assignment.talent.id === talent.id,
                        ),
                    )
                    .map((talent) => (
                      <option key={talent.id} value={talent.id}>
                        {talent.fullName}
                      </option>
                    ))}
                </select>
                <Label htmlFor="production-talent-role">Role</Label>
                <Input
                  id="production-talent-role"
                  value={talentRole}
                  maxLength={100}
                  disabled={!onAssignTalent || busy || talentsUnavailable}
                  onChange={(event) => setTalentRole(event.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    !onAssignTalent || busy || !talentId || !talentRole.trim()
                  }
                  onClick={() => {
                    if (onAssignTalent)
                      void perform(
                        () =>
                          onAssignTalent(
                            selected.id,
                            talentId,
                            talentRole.trim(),
                          ),
                        "Talent assigned.",
                      ).then((success) => {
                        if (success) {
                          setTalentId("");
                          setTalentRole("");
                        }
                      });
                  }}
                >
                  Assign talent
                </Button>
                {talentsUnavailable ? (
                  <p className="text-muted-foreground text-xs">
                    The talent directory is unavailable for your role.
                  </p>
                ) : null}
                {onRemoveTalent ? (
                  <ul className="space-y-1">
                    {selected.talents.map((assignment) => (
                      <li
                        key={assignment.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          {assignment.talent.fullName} ({assignment.role})
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          aria-label={`Unassign ${assignment.talent.fullName}`}
                          onClick={() =>
                            void perform(
                              () =>
                                onRemoveTalent(
                                  selected.id,
                                  assignment.talent.id,
                                ),
                              "Talent unassigned.",
                            )
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
          <section
            aria-label="Connected workspace"
            className="border-border space-y-3 border-t pt-4"
          >
            <h3 className="font-medium">Connected workspace</h3>
            <div
              role="tablist"
              aria-label="Production workspace sections"
              className="flex gap-2 overflow-x-auto pb-1"
            >
              {areas.map((area) => (
                <button
                  key={area}
                  type="button"
                  role="tab"
                  aria-selected={activeArea === area}
                  aria-controls="production-area-panel"
                  onClick={() => setActiveArea(area)}
                  className="border-border focus-visible:ring-ring/50 aria-selected:bg-muted shrink-0 rounded-md border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
                >
                  {area}
                </button>
              ))}
            </div>
            <div
              id="production-area-panel"
              role="tabpanel"
              className="text-muted-foreground space-y-2 text-sm"
            >
              {activeArea === "Overview" ? (
                <p>
                  Workspace {selected.workspaceId}. Its team and talent
                  assignments are shown above.
                </p>
              ) : activeArea === "Team" ? (
                <p>
                  {selected.teams.length} assigned team
                  {selected.teams.length === 1 ? "" : "s"};{" "}
                  {selected.participants.length} member
                  {selected.participants.length === 1 ? "" : "s"}.
                </p>
              ) : activeArea === "Talent" ? (
                <p>
                  {selected.talents.length} talent assignment
                  {selected.talents.length === 1 ? "" : "s"}.
                </p>
              ) : (
                <p>
                  {activeArea} belongs to this production workspace. Open the{" "}
                  {activeArea.toLowerCase()} area to manage its records.
                </p>
              )}
              {destinations[activeArea] ? (
                <Link
                  href={destinations[activeArea]}
                  className="inline-block underline underline-offset-4"
                >
                  Open {activeArea}
                </Link>
              ) : null}
            </div>
          </section>
          <div className="flex flex-wrap items-center gap-2">
            {canUpdate ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!onUpdate || busy}
                onClick={() => setForm("edit")}
              >
                Edit details
              </Button>
            ) : null}
            {canTransition && nextProductionStatuses[selected.status].length ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="production-transition">Move to</Label>
                <select
                  id="production-transition"
                  value=""
                  disabled={!onTransition || busy}
                  onChange={(event) => {
                    if (onTransition)
                      void perform(
                        () =>
                          onTransition(
                            selected.id,
                            event.target.value as ProductionStatus,
                          ),
                        "Production status updated.",
                      );
                  }}
                  className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">Choose status</option>
                  {nextProductionStatuses[selected.status].map((value) => (
                    <option key={value} value={value}>
                      {productionStatusLabel[value]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {canDelete ? (
              confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">
                    Permanently delete this production?
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy || !onDelete}
                    onClick={() => {
                      if (onDelete)
                        void perform(
                          () => onDelete(selected.id),
                          "Production deleted.",
                        ).then((succeeded) => {
                          if (succeeded) {
                            setSelectedId(null);
                            onCloseDetails?.();
                          }
                        });
                    }}
                  >
                    Confirm delete
                  </Button>
                </div>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!onDelete || busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete production
                </Button>
              )
            ) : null}
          </div>
        </section>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {form === "create" && onCreate ? (
        <ProductionForm
          open
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
          onSave={async (values) => {
            await onCreate(values);
            setAnnouncement("Production created.");
          }}
        />
      ) : null}
      {form === "edit" && selected && onUpdate ? (
        <ProductionForm
          key={selected.id}
          open
          initial={editValues(selected)}
          onOpenChange={(open) => {
            if (!open) setForm(null);
          }}
          onSave={async (values) => {
            await onUpdate(selected.id, values);
            setAnnouncement("Production details saved.");
          }}
        />
      ) : null}
      <Link
        href="/projects"
        className="inline-block text-sm underline underline-offset-4"
      >
        View general projects
      </Link>
    </div>
  );
}
