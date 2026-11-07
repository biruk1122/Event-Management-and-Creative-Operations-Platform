import { Injectable } from "@nestjs/common";
import {
  AuditActorKind,
  AuditOutcome,
  OutboxActorKind,
  Prisma,
  TalentActivityType,
  TalentAssignmentStatus,
} from "../generated/prisma/client.js";
import { AuditWriterService } from "../audit/audit-writer.service.js";
import { OutboxWriterService } from "../outbox/outbox-writer.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { TalentRepository } from "./infrastructure/talent.repository.js";
import {
  TalentAssignmentsRepository,
  type AssignmentRow,
  type EventTalentSummary,
  type WorkItem,
} from "./infrastructure/talent-assignments.repository.js";
import { TalentAccessService } from "./talent-access.service.js";
import {
  assignmentPhase,
  findConflicts,
  isAssignmentBlocked,
  requiresOverrideConfirmation,
  type AssignmentConflict,
  type AssignmentKind,
  type OtherAssignment,
  type TalentAvailability,
  type TalentSchedule,
} from "./talent-assignment.domain.js";
import {
  talentAssignmentConflict,
  talentAssignmentDatesInvalid,
  talentAssignmentDuplicate,
  talentAssignmentNotFound,
  talentAssignmentReasonRequired,
  talentAssignmentTerminal,
  talentInactive,
  talentNotFound,
  talentWorkNotFound,
} from "./talent.errors.js";
import type {
  ArchivedWork,
  ArchiveHook,
  ArchivingWork,
} from "../common/archive/archive-hook.js";
import type {
  CreateTalentAssignmentDto,
  ListAssignableWorksQueryDto,
  TalentAssignmentWindowDto,
  TransitionTalentAssignmentDto,
  UpdateTalentAssignmentDto,
} from "./dto/talent-assignment.dto.js";

/**
 * Who authorizes a write. "talent" applies the talent rules: organization
 * talent.assign, or the Production Manager scope. "owning-module" is passed only
 * by the production route, after it has verified the caller's existing
 * project.assign grant for that production. That keeps the access other
 * department managers already have. Every business rule still applies on that
 * route: conflicts, duplicates, inactive talent, dates, history, and audit.
 */
export type Authority = "talent" | "owning-module";

export interface TalentAssignmentView {
  kind: AssignmentKind;
  id: string;
  workId: string;
  workName: string;
  departmentId: string | null;
  role: string;
  status: TalentAssignmentStatus;
  phase: "upcoming" | "active" | "completed" | "cancelled";
  notes: string | null;
  startAt: string | null;
  endAt: string | null;
  assignedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  assignedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  cancelledBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface AssignmentCheck {
  blocked: boolean;
  duplicate: boolean;
  conflicts: AssignmentConflict[];
}

const WRITE_ACTOR = AuditActorKind.USER;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** `undefined` means "not supplied", `null` clears the date, a string sets it. */
function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

/** The effective value of a date that an update may leave unchanged, clear, or set. */
function nextDate(
  supplied: string | null | undefined,
  current: Date | null,
): Date | null {
  const parsed = parseDate(supplied);
  return parsed === undefined ? current : parsed;
}

/** The reason every assignment cancelled by an archive records. */
export const WORK_ARCHIVED_REASON = "Work item archived.";

@Injectable()
export class TalentAssignmentsService {
  constructor(
    private readonly talents: TalentRepository,
    private readonly repository: TalentAssignmentsRepository,
    private readonly access: TalentAccessService,
    private readonly audit: AuditWriterService,
    private readonly outbox: OutboxWriterService,
  ) {}

  // ---- reads ----------------------------------------------------------------

  /**
   * The talents assigned to one event, for the event's Talents tab. The same
   * directory rule as the talent-side list applies: a caller needs talent
   * access, and a masked caller sees only rows for work they can manage. Only
   * the talent's name, type and status are included, never contact details.
   */
  async listForEvent(
    userId: string,
    eventId: string,
  ): Promise<(TalentAssignmentView & { talent: EventTalentSummary })[]> {
    const mode = await this.access.directoryMode(userId);
    if (!mode) throw permissionDenied();
    const rows = await this.repository.assignmentsForEvent(eventId);
    const visible: typeof rows = [];
    for (const row of rows) {
      if (
        mode === "full" ||
        (await this.access.canManageWork(
          userId,
          row.kind,
          row.work.departmentId,
        ))
      ) {
        visible.push(row);
      }
    }
    return visible.map((row) => ({ ...toView(row), talent: row.talent }));
  }

  /**
   * Every assignment of the talent that the caller may see: all of them for
   * organization talent readers, and only those for their own department's work
   * for Production Managers.
   */
  async list(
    userId: string,
    talentId: string,
  ): Promise<TalentAssignmentView[]> {
    const mode = await this.access.directoryMode(userId);
    if (!mode) throw permissionDenied();
    await this.loadTalent(talentId);
    const rows = await this.repository.assignmentsForTalent(talentId);
    const visible: AssignmentRow[] = [];
    for (const row of rows) {
      if (
        mode === "full" ||
        (await this.access.canManageWork(
          userId,
          row.kind,
          row.work.departmentId,
        ))
      ) {
        visible.push(row);
      }
    }
    return visible.map((row) => toView(row));
  }

  /**
   * Talent history. Organization talent readers see every entry, which includes
   * profile changes. A Production Manager sees only the assignment entries for
   * work they can manage, so profile changes and other departments stay hidden.
   */
  async history(userId: string, talentId: string) {
    const mode = await this.access.directoryMode(userId);
    if (!mode) throw permissionDenied();
    await this.loadTalent(talentId);
    const entries = await this.repository.activityForTalent(talentId);
    const visible =
      mode === "full"
        ? entries
        : await this.ownWorkEntries(userId, talentId, entries);
    return visible.map((entry) => ({
      id: entry.id,
      type: entry.type,
      assignmentKind: entry.assignmentKind,
      assignmentId: entry.assignmentId,
      details: entry.details,
      occurredAt: entry.occurredAt.toISOString(),
      actor: entry.actor,
    }));
  }

  /** History entries for the assignments the caller can manage; talent-level entries are excluded. */
  private async ownWorkEntries<T extends { assignmentId: string | null }>(
    userId: string,
    talentId: string,
    entries: readonly T[],
  ): Promise<T[]> {
    const manageable = new Set<string>();
    for (const row of await this.repository.assignmentsForTalent(talentId)) {
      if (
        await this.access.canManageWork(userId, row.kind, row.work.departmentId)
      ) {
        manageable.add(row.id);
      }
    }
    return entries.filter(
      (entry) =>
        entry.assignmentId !== null && manageable.has(entry.assignmentId),
    );
  }

  /** Work items the caller may assign talent to, for the Assign dialog. */
  async assignableWorks(userId: string, query: ListAssignableWorksQueryDto) {
    const kind = query.kind;
    const fullAssign = await this.access.hasOrganizationGrant(
      userId,
      "talent.assign",
    );
    if (fullAssign) {
      const items = await this.repository.workItems(kind, {
        ...(query.search ? { search: query.search.trim() } : {}),
        take: 50,
      });
      return items.map(toWorkOption);
    }
    const context = await this.access.isProductionManager(userId);
    if (!context || kind === "PROMOTION") throw permissionDenied();
    const department = await this.access.managerDepartmentId(userId);
    if (!department) throw permissionDenied();
    const items = await this.repository.workItems(kind, {
      departmentId: department,
      ...(query.search ? { search: query.search.trim() } : {}),
      take: 50,
    });
    const allowed: WorkItem[] = [];
    for (const item of items) {
      if (await this.access.canManageWork(userId, kind, item.departmentId)) {
        allowed.push(item);
      }
    }
    return allowed.map(toWorkOption);
  }

  // ---- checks and writes ----------------------------------------------------

  /** Dry run: reports blocks and conflicts with the current data, saves nothing. */
  async check(
    userId: string,
    talentId: string,
    input: TalentAssignmentWindowDto,
  ): Promise<AssignmentCheck> {
    const talent = await this.loadTalent(talentId);
    const work = await this.loadWork(input.kind, input.workId);
    await this.requireManage(userId, work, "talent");
    const window = this.windowFor(work, input);
    const duplicate = await this.repository.hasActiveAssignment(
      talentId,
      input.kind,
      input.workId,
    );
    const conflicts = await this.conflictsFor(talent, window, undefined);
    return {
      blocked: isAssignmentBlocked(talent.availability),
      duplicate,
      conflicts,
    };
  }

  async create(
    userId: string,
    talentId: string,
    input: CreateTalentAssignmentDto,
    requestId: string,
    authority: Authority = "talent",
  ): Promise<TalentAssignmentView> {
    const talent = await this.loadTalent(talentId);
    const work = await this.loadWork(input.kind, input.workId);
    await this.requireManage(userId, work, authority);
    const window = this.windowFor(work, input);
    if (window.startAt && window.endAt && window.endAt < window.startAt) {
      throw talentAssignmentDatesInvalid();
    }
    // Inactive talent and duplicates are never overridable, so they are checked first.
    if (isAssignmentBlocked(talent.availability)) throw talentInactive();
    if (
      await this.repository.hasActiveAssignment(
        talentId,
        input.kind,
        input.workId,
      )
    ) {
      throw talentAssignmentDuplicate();
    }
    const conflicts = await this.conflictsFor(talent, window, undefined);
    const acknowledged = input.acknowledgeConflicts === true;
    if (requiresOverrideConfirmation(conflicts, acknowledged)) {
      throw talentAssignmentConflict(conflicts);
    }
    const overridden = conflicts.length > 0;
    const recipients = await this.recipientsFor(talentId, work, userId);
    const talentName = talent.fullName;

    let assignmentId: string;
    try {
      assignmentId = await this.repository.transaction(async (tx) => {
        const id = await this.repository.insertAssignment(tx, {
          kind: input.kind,
          talentId,
          workId: input.workId,
          role: input.role.trim(),
          startAt: window.startAt,
          endAt: window.endAt,
          notes: input.notes?.trim() || null,
          assignedById: userId,
        });
        await this.repository.recordActivity(tx, {
          talentId,
          type: TalentActivityType.ASSIGNMENT_CREATED,
          assignmentKind: input.kind,
          assignmentId: id,
          actorId: userId,
          details: {
            workId: input.workId,
            workName: work.name,
            role: input.role.trim(),
            startAt: iso(window.startAt),
            endAt: iso(window.endAt),
          },
        });
        await this.audit.append(tx, {
          action: "talent.assignment.created",
          actorKind: WRITE_ACTOR,
          actorUserId: userId,
          requestId,
          outcome: AuditOutcome.SUCCEEDED,
          resourceType: "talent",
          resourceId: talentId,
          metadata: {
            assignmentKind: input.kind,
            assignmentId: id,
            workId: input.workId,
            overridden,
          },
        });
        if (overridden) {
          await this.recordOverride(tx, {
            talentId,
            kind: input.kind,
            assignmentId: id,
            userId,
            requestId,
            reason: input.overrideReason ?? null,
            conflicts,
          });
        }
        await this.enqueueNotifications(tx, {
          name: "talent.assigned",
          talentId,
          userId,
          requestId,
          recipients,
          payload: {
            talentName,
            workName: work.name,
            role: input.role.trim(),
            assignmentKind: input.kind,
            workId: input.workId,
            ...(work.eventId ? { eventId: work.eventId } : {}),
          },
        });
        return id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw talentAssignmentDuplicate();
      throw error;
    }
    const created = await this.repository.findAssignment(
      talentId,
      input.kind,
      assignmentId,
    );
    return toView(created!);
  }

  async update(
    userId: string,
    talentId: string,
    kind: AssignmentKind,
    assignmentId: string,
    input: UpdateTalentAssignmentDto,
    requestId: string,
  ): Promise<TalentAssignmentView> {
    const talent = await this.loadTalent(talentId);
    const row = await this.loadAssignment(talentId, kind, assignmentId);
    await this.requireManage(userId, row.work, "talent");
    if (row.status !== TalentAssignmentStatus.ASSIGNED)
      throw talentAssignmentTerminal();

    const startAt = nextDate(input.startAt, row.startAt);
    const endAt = nextDate(input.endAt, row.endAt);
    if (startAt && endAt && endAt < startAt)
      throw talentAssignmentDatesInvalid();
    const datesChanged =
      iso(startAt) !== iso(row.startAt) || iso(endAt) !== iso(row.endAt);

    let conflicts: AssignmentConflict[] = [];
    if (datesChanged) {
      conflicts = await this.conflictsFor(
        talent,
        { startAt, endAt },
        assignmentId,
      );
      if (
        requiresOverrideConfirmation(
          conflicts,
          input.acknowledgeConflicts === true,
        )
      ) {
        throw talentAssignmentConflict(conflicts);
      }
    }
    const overridden = conflicts.length > 0;
    const nextRole = input.role?.trim() ?? row.role;
    const nextNotes =
      input.notes === undefined ? row.notes : input.notes?.trim() || null;

    await this.repository.transaction(async (tx) => {
      await this.repository.updateAssignment(tx, kind, assignmentId, {
        role: nextRole,
        notes: nextNotes,
        startAt,
        endAt,
      });
      await this.repository.recordActivity(tx, {
        talentId,
        type: TalentActivityType.ASSIGNMENT_UPDATED,
        assignmentKind: kind,
        assignmentId,
        actorId: userId,
        details: {
          from: {
            role: row.role,
            notes: row.notes,
            startAt: iso(row.startAt),
            endAt: iso(row.endAt),
          },
          to: {
            role: nextRole,
            notes: nextNotes,
            startAt: iso(startAt),
            endAt: iso(endAt),
          },
        },
      });
      await this.audit.append(tx, {
        action: "talent.assignment.updated",
        actorKind: WRITE_ACTOR,
        actorUserId: userId,
        requestId,
        outcome: AuditOutcome.SUCCEEDED,
        resourceType: "talent",
        resourceId: talentId,
        metadata: {
          assignmentKind: kind,
          assignmentId,
          workId: row.workId,
          datesChanged,
          overridden,
        },
      });
      if (overridden) {
        await this.recordOverride(tx, {
          talentId,
          kind,
          assignmentId,
          userId,
          requestId,
          reason: input.overrideReason ?? null,
          conflicts,
        });
      }
    });
    const updated = await this.repository.findAssignment(
      talentId,
      kind,
      assignmentId,
    );
    return toView(updated!);
  }

  /** Completes or cancels an ASSIGNED assignment. Cancelling needs a reason and notifies the recipients. */
  async transition(
    userId: string,
    talentId: string,
    kind: AssignmentKind,
    assignmentId: string,
    input: TransitionTalentAssignmentDto,
    requestId: string,
    authority: Authority = "talent",
  ): Promise<TalentAssignmentView> {
    const talent = await this.loadTalent(talentId);
    const row = await this.loadAssignment(talentId, kind, assignmentId);
    await this.requireManage(userId, row.work, authority);
    if (row.status !== TalentAssignmentStatus.ASSIGNED)
      throw talentAssignmentTerminal();
    const reason = input.reason?.trim() || null;
    if (input.status === "CANCELLED" && !reason)
      throw talentAssignmentReasonRequired();

    const at = new Date();
    const recipients =
      input.status === "CANCELLED"
        ? await this.recipientsFor(talentId, row.work, userId)
        : [];
    await this.repository.transaction(async (tx) => {
      await this.repository.terminateAssignment(tx, kind, assignmentId, {
        status: input.status,
        actorId: userId,
        reason,
        at,
      });
      await this.repository.recordActivity(tx, {
        talentId,
        type:
          input.status === "COMPLETED"
            ? TalentActivityType.ASSIGNMENT_COMPLETED
            : TalentActivityType.ASSIGNMENT_CANCELLED,
        assignmentKind: kind,
        assignmentId,
        actorId: userId,
        details: {
          workId: row.workId,
          workName: row.work.name,
          ...(reason ? { reason } : {}),
        },
      });
      await this.audit.append(tx, {
        action:
          input.status === "COMPLETED"
            ? "talent.assignment.completed"
            : "talent.assignment.cancelled",
        actorKind: WRITE_ACTOR,
        actorUserId: userId,
        requestId,
        outcome: AuditOutcome.SUCCEEDED,
        resourceType: "talent",
        resourceId: talentId,
        metadata: { assignmentKind: kind, assignmentId, workId: row.workId },
      });
      if (input.status === "CANCELLED") {
        await this.enqueueNotifications(tx, {
          name: "talent.assignment_cancelled",
          talentId,
          userId,
          requestId,
          recipients,
          payload: {
            talentName: talent.fullName,
            workName: row.work.name,
            assignmentKind: kind,
            workId: row.workId,
            ...(row.work.eventId ? { eventId: row.work.eventId } : {}),
          },
        });
      }
    });
    const updated = await this.repository.findAssignment(
      talentId,
      kind,
      assignmentId,
    );
    return toView(updated!);
  }

  /**
   * Cancels the talent's active assignment to one work item. The production and
   * promotional remove routes use this, so removal follows the same rules,
   * history and audit as cancelling from the assignment API.
   */
  async cancelActiveForWork(
    userId: string,
    talentId: string,
    kind: AssignmentKind,
    workId: string,
    reason: string,
    requestId: string,
    authority: Authority = "talent",
  ): Promise<TalentAssignmentView> {
    const id = await this.repository.activeAssignmentId(talentId, kind, workId);
    if (!id) throw talentAssignmentNotFound();
    return this.transition(
      userId,
      talentId,
      kind,
      id,
      { status: "CANCELLED", reason },
      requestId,
      authority,
    );
  }

  /**
   * The archive hook an owning module passes to its archive transaction. It
   * cancels the active assignments of every archived work item in that same
   * transaction, so either the archive and the cancellations both commit, or
   * neither does.
   */
  archiveHook(actorId: string, requestId: string): ArchiveHook {
    return async (tx, archiving) => {
      await this.cancelForArchivedWorks(tx, archiving, actorId, requestId);
    };
  }

  /**
   * Cancels each ASSIGNED row of the archived works. Rows are never deleted or
   * reused: each keeps its work-name snapshot and gains the cancellation with its
   * actor, time and reason, plus a history entry and an audit record. Each talent
   * gets one notification per recipient, however many of the works they held.
   */
  private async cancelForArchivedWorks(
    tx: Prisma.TransactionClient,
    archiving: ArchivingWork,
    actorId: string,
    requestId: string,
  ): Promise<void> {
    const at = new Date();
    const byTalent = new Map<
      string,
      {
        talentName: string;
        works: ArchivedWork[];
        cancellations: {
          kind: AssignmentKind;
          assignmentId: string;
          work: ArchivedWork;
        }[];
      }
    >();
    for (const work of archiving.works) {
      const rows = await this.repository.activeAssignmentsForWork(
        tx,
        work.kind,
        work.workId,
      );
      for (const row of rows) {
        const entry = byTalent.get(row.talentId) ?? {
          talentName: row.talentName,
          works: [],
          cancellations: [],
        };
        entry.works.push(work);
        entry.cancellations.push({
          kind: work.kind,
          assignmentId: row.id,
          work,
        });
        byTalent.set(row.talentId, entry);
      }
    }
    for (const [talentId, entry] of byTalent) {
      const recipients = (
        await this.repository.notificationRecipients(
          talentId,
          archiving.workspaceManagerId,
        )
      ).filter((userId) => userId !== actorId);
      for (const cancellation of entry.cancellations) {
        await this.repository.terminateAssignment(
          tx,
          cancellation.kind,
          cancellation.assignmentId,
          {
            status: "CANCELLED",
            actorId,
            reason: WORK_ARCHIVED_REASON,
            at,
          },
        );
        await this.repository.recordActivity(tx, {
          talentId,
          type: TalentActivityType.ASSIGNMENT_CANCELLED,
          assignmentKind: cancellation.kind,
          assignmentId: cancellation.assignmentId,
          actorId,
          details: {
            workId: cancellation.work.workId,
            workName: cancellation.work.workName,
            reason: WORK_ARCHIVED_REASON,
          },
        });
        await this.audit.append(tx, {
          action: "talent.assignment.cancelled",
          actorKind: WRITE_ACTOR,
          actorUserId: actorId,
          requestId,
          outcome: AuditOutcome.SUCCEEDED,
          resourceType: "talent",
          resourceId: talentId,
          metadata: {
            assignmentKind: cancellation.kind,
            assignmentId: cancellation.assignmentId,
            workId: cancellation.work.workId,
            reason: WORK_ARCHIVED_REASON,
          },
        });
      }
      // One notification per talent and recipient: the archived parent is named once.
      await this.enqueueNotifications(tx, {
        name: "talent.assignment_cancelled",
        talentId,
        userId: actorId,
        requestId,
        recipients,
        payload: {
          talentName: entry.talentName,
          workName: archiving.label,
          assignmentKind: entry.works[0]!.kind,
          workId: entry.works[0]!.workId,
          reason: WORK_ARCHIVED_REASON,
        },
      });
    }
  }

  // ---- internals ------------------------------------------------------------

  private async loadTalent(talentId: string) {
    const talent = await this.talents.findById(talentId);
    if (!talent) throw talentNotFound();
    return talent;
  }

  private async loadWork(
    kind: AssignmentKind,
    workId: string,
  ): Promise<WorkItem> {
    const work = await this.repository.workItem(kind, workId);
    if (!work) throw talentWorkNotFound();
    return work;
  }

  private async loadAssignment(
    talentId: string,
    kind: AssignmentKind,
    id: string,
  ): Promise<AssignmentRow> {
    const row = await this.repository.findAssignment(talentId, kind, id);
    if (!row) throw talentAssignmentNotFound();
    return row;
  }

  /** Server-side gate for every assignment write, including the override path. */
  private async requireManage(
    userId: string,
    work: WorkItem,
    authority: Authority,
  ): Promise<void> {
    // The owning module has already authorized the caller (see Authority).
    if (authority === "owning-module") return;
    if (
      !(await this.access.canManageWork(userId, work.kind, work.departmentId))
    ) {
      throw permissionDenied();
    }
  }

  /** The dates an assignment occupies: its own, else the work's. */
  private windowFor(
    work: WorkItem,
    input: { startAt?: string | null; endAt?: string | null },
  ): { startAt: Date | null; endAt: Date | null } {
    return {
      startAt: nextDate(input.startAt, work.startAt),
      endAt: nextDate(input.endAt, work.endAt),
    };
  }

  /** Conflicts recalculated from the database every time; the client's list is never trusted. */
  private async conflictsFor(
    talent: {
      id: string;
      availability: TalentAvailability;
      schedules: TalentSchedule[];
    },
    window: { startAt: Date | null; endAt: Date | null },
    excludeAssignmentId: string | undefined,
  ): Promise<AssignmentConflict[]> {
    const active = await this.repository.activeAssignmentsForTalent(talent.id);
    const others: OtherAssignment[] = active
      .filter((row) => row.id !== excludeAssignmentId)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.work.name,
        status: row.status as "ASSIGNED",
        startAt: row.startAt ?? row.work.startAt,
        endAt: row.endAt ?? row.work.endAt,
      }));
    return findConflicts({
      window,
      availability: talent.availability,
      otherAssignments: others,
      schedules: talent.schedules,
    });
  }

  private async recipientsFor(
    talentId: string,
    work: WorkItem,
    actorId: string,
  ): Promise<string[]> {
    const recipients = await this.repository.notificationRecipients(
      talentId,
      work.workspaceManagerId,
    );
    return recipients.filter((userId) => userId !== actorId);
  }

  private async recordOverride(
    tx: Prisma.TransactionClient,
    input: {
      talentId: string;
      kind: AssignmentKind;
      assignmentId: string;
      userId: string;
      requestId: string;
      reason: string | null;
      conflicts: AssignmentConflict[];
    },
  ): Promise<void> {
    const conflicts = input.conflicts as unknown as Prisma.InputJsonValue;
    await this.repository.recordOverride(tx, {
      talentId: input.talentId,
      kind: input.kind,
      assignmentId: input.assignmentId,
      authorizedById: input.userId,
      reason: input.reason,
      conflicts,
    });
    await this.repository.recordActivity(tx, {
      talentId: input.talentId,
      type: TalentActivityType.CONFLICT_OVERRIDDEN,
      assignmentKind: input.kind,
      assignmentId: input.assignmentId,
      actorId: input.userId,
      details: {
        ...(input.reason ? { reason: input.reason } : {}),
        conflicts: conflicts,
      },
    });
    await this.audit.append(tx, {
      action: "talent.conflict_overridden",
      actorKind: WRITE_ACTOR,
      actorUserId: input.userId,
      requestId: input.requestId,
      outcome: AuditOutcome.SUCCEEDED,
      resourceType: "talent",
      resourceId: input.talentId,
      metadata: {
        assignmentKind: input.kind,
        assignmentId: input.assignmentId,
        conflictCount: input.conflicts.length,
      },
    });
  }

  private async enqueueNotifications(
    tx: Prisma.TransactionClient,
    input: {
      name: "talent.assigned" | "talent.assignment_cancelled";
      talentId: string;
      userId: string;
      requestId: string;
      recipients: string[];
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    // One outbox event per recipient: each delivery is durable and independently retried.
    for (const recipientUserId of input.recipients) {
      await this.outbox.append(tx, {
        name: input.name,
        version: 1,
        actorKind: OutboxActorKind.USER,
        actorUserId: input.userId,
        correlationId: input.requestId,
        resourceType: "talent",
        resourceId: input.talentId,
        payload: { ...input.payload, recipientUserId },
        consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
      });
    }
  }
}

function toView(row: AssignmentRow): TalentAssignmentView {
  return {
    kind: row.kind,
    id: row.id,
    workId: row.workId,
    workName: row.workName,
    departmentId: row.work.departmentId,
    role: row.role,
    status: row.status,
    phase: assignmentPhase(
      row.status,
      row.startAt ?? row.work.startAt,
      new Date(),
    ),
    notes: row.notes,
    startAt: iso(row.startAt),
    endAt: iso(row.endAt),
    assignedAt: row.createdAt.toISOString(),
    completedAt: iso(row.completedAt),
    cancelledAt: iso(row.cancelledAt),
    cancelReason: row.cancelReason,
    assignedBy: row.assignedBy,
    cancelledBy: row.cancelledBy,
  };
}

function toWorkOption(item: WorkItem) {
  return {
    kind: item.kind,
    id: item.id,
    name: item.name,
    startAt: iso(item.startAt),
    endAt: iso(item.endAt),
    departmentId: item.departmentId,
  };
}
