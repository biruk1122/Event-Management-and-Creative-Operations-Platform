"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ProductionForm, type ProductionValues } from "./production-form";
import {
  nextProductionStatuses,
  productionDate,
  productionPersonName,
  productionStatusLabel,
  type Production,
  type ProductionStatus,
} from "../lib/production-types";

type WorkspaceArea =
  | "Tasks"
  | "Calendar"
  | "Discussion"
  | "Meetings"
  | "Files"
  | "Talent"
  | "Reports";
const areas: WorkspaceArea[] = [
  "Tasks",
  "Calendar",
  "Discussion",
  "Meetings",
  "Files",
  "Talent",
  "Reports",
];

export interface ProductionsBoardProps {
  productions: readonly Production[];
  state: "loading" | "ready" | "error" | "denied";
  onRetry?: () => void;
  canCreate?: boolean;
  canUpdate?: boolean;
  canTransition?: boolean;
  canAssign?: boolean;
  canDelete?: boolean;
  availablePeople?: readonly NonNullable<Production["manager"]>[];
  onCreate?: (values: ProductionValues) => Promise<void>;
  onUpdate?: (id: string, values: ProductionValues) => Promise<void>;
  onTransition?: (id: string, status: ProductionStatus) => Promise<void>;
  onAssignManager?: (id: string, userId: string | null) => Promise<void>;
  onAddMember?: (id: string, userId: string) => Promise<void>;
  onRemoveMember?: (id: string, userId: string) => Promise<void>;
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
  canCreate,
  canUpdate,
  canTransition,
  canAssign,
  canDelete,
  availablePeople = [],
  onCreate,
  onUpdate,
  onTransition,
  onAssignManager,
  onAddMember,
  onRemoveMember,
  onDelete,
}: ProductionsBoardProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProductionStatus | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<"create" | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const selected = productions.find((item) => item.id === selectedId);
  const filtered = productions.filter(
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
    } catch {
      setActionError("We could not complete that action. Try again.");
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
          {productions.length} production{productions.length === 1 ? "" : "s"}
        </p>
        {canCreate ? (
          <Button disabled={!onCreate} onClick={() => setForm("create")}>
            New production
          </Button>
        ) : null}
      </div>
      {!onCreate && canCreate ? (
        <p className="text-muted-foreground text-sm">
          Creation will be available when production data is connected.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="production-search">Search productions</Label>
          <Input
            id="production-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="production-status">Status</Label>
          <select
            id="production-status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ProductionStatus | "ALL")
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
            {productions.length
              ? "No productions match these filters"
              : "No productions yet"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {productions.length
              ? "Adjust your search or status filter."
              : "Production records will appear here when connected."}
          </p>
          {productions.length ? (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearch("");
                setStatus("ALL");
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
                  setConfirmDelete(false);
                  setActionError("");
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
              onClick={() => setSelectedId(null)}
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
                  {availablePeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {productionPersonName(person)}
                    </option>
                  ))}
                </select>
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
          <div className="space-y-2">
            <h3 className="font-medium">Connected work</h3>
            <p className="text-muted-foreground text-sm">
              These workspace areas will open when production integration is
              connected.
            </p>
            <ul className="flex flex-wrap gap-2">
              {areas.map((area) => (
                <li key={area}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled
                    title={`${area} is not connected yet`}
                  >
                    {area}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
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
                          if (succeeded) setSelectedId(null);
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
