import { Injectable } from "@nestjs/common";
import {
  Prisma,
  TalentActivityType,
  TalentAssignmentKind,
  TalentAssignmentStatus,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import type { AssignmentKind } from "../talent-assignment.domain.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const person = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

/** A work item a talent can be assigned to: an event, a production, or a promotional activity. */
export interface WorkItem {
  kind: AssignmentKind;
  id: string;
  name: string;
  startAt: Date | null;
  endAt: Date | null;
  departmentId: string | null;
  /** The responsible manager of the workspace that owns the work item. */
  workspaceManagerId: string | null;
  /** The event this work belongs to; only event assignments link a notification to an event. */
  eventId: string | null;
}

export interface AssignmentRow {
  kind: AssignmentKind;
  /** The work item's name as it was when the assignment was made. */
  workName: string;
  id: string;
  talentId: string;
  workId: string;
  work: WorkItem;
  role: string;
  status: TalentAssignmentStatus;
  notes: string | null;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  assignedBy: PersonRef | null;
  completedBy: PersonRef | null;
  cancelledBy: PersonRef | null;
}

export interface PersonRef {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const KIND_TO_ENUM: Record<AssignmentKind, TalentAssignmentKind> = {
  EVENT: TalentAssignmentKind.EVENT,
  PRODUCTION: TalentAssignmentKind.PRODUCTION,
  PROMOTION: TalentAssignmentKind.PROMOTION,
};

type Tx = Prisma.TransactionClient;

@Injectable()
export class TalentAssignmentsRepository {
  constructor(private readonly db: DatabaseService) {}

  transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.$transaction((tx) => run(tx));
  }

  // ---- work items -----------------------------------------------------------

  async workItem(
    kind: AssignmentKind,
    workId: string,
  ): Promise<WorkItem | null> {
    if (!UUID.test(workId)) return null;
    if (kind === "EVENT") {
      const event = await this.db.event.findFirst({
        where: { id: workId, archivedAt: null },
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
          departmentId: true,
          workspace: { select: { managerId: true } },
        },
      });
      return event
        ? {
            kind,
            id: event.id,
            name: event.name,
            startAt: event.startAt,
            endAt: event.endAt,
            departmentId: event.departmentId,
            workspaceManagerId: event.workspace.managerId,
            eventId: event.id,
          }
        : null;
    }
    if (kind === "PRODUCTION") {
      const production = await this.db.production.findFirst({
        where: { id: workId, archivedAt: null },
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
          departmentId: true,
          workspace: { select: { managerId: true } },
        },
      });
      return production
        ? {
            kind,
            id: production.id,
            name: production.name,
            startAt: production.startAt,
            endAt: production.endAt,
            departmentId: production.departmentId,
            workspaceManagerId: production.workspace.managerId,
            eventId: null,
          }
        : null;
    }
    const promotion = await this.db.promotionActivity.findFirst({
      where: {
        campaignActivityId: workId,
        archivedAt: null,
        activity: { archivedAt: null },
        campaign: { archivedAt: null },
      },
      select: {
        campaignActivityId: true,
        activity: { select: { name: true, startAt: true, endAt: true } },
        campaign: {
          select: {
            departmentId: true,
            workspace: { select: { managerId: true } },
          },
        },
      },
    });
    return promotion
      ? {
          kind,
          id: promotion.campaignActivityId,
          name: promotion.activity.name,
          startAt: promotion.activity.startAt,
          endAt: promotion.activity.endAt,
          departmentId: promotion.campaign.departmentId,
          workspaceManagerId: promotion.campaign.workspace.managerId,
          eventId: null,
        }
      : null;
  }

  /** Events, productions and promotional activities that match a search, for the Assign dialog. */
  async workItems(
    kind: AssignmentKind,
    input: { departmentId?: string; search?: string; take: number },
  ): Promise<WorkItem[]> {
    const name = input.search
      ? { contains: input.search, mode: "insensitive" as const }
      : undefined;
    if (kind === "EVENT") {
      const rows = await this.db.event.findMany({
        where: {
          archivedAt: null,
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(name ? { name } : {}),
        },
        orderBy: { startAt: "desc" },
        take: input.take,
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
          departmentId: true,
          workspace: { select: { managerId: true } },
        },
      });
      return rows.map((row) => ({
        kind,
        id: row.id,
        name: row.name,
        startAt: row.startAt,
        endAt: row.endAt,
        departmentId: row.departmentId,
        workspaceManagerId: row.workspace.managerId,
        eventId: row.id,
      }));
    }
    if (kind === "PRODUCTION") {
      const rows = await this.db.production.findMany({
        where: {
          archivedAt: null,
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(name ? { name } : {}),
        },
        orderBy: { startAt: "desc" },
        take: input.take,
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
          departmentId: true,
          workspace: { select: { managerId: true } },
        },
      });
      return rows.map((row) => ({
        kind,
        id: row.id,
        name: row.name,
        startAt: row.startAt,
        endAt: row.endAt,
        departmentId: row.departmentId,
        workspaceManagerId: row.workspace.managerId,
        eventId: null,
      }));
    }
    const rows = await this.db.promotionActivity.findMany({
      where: {
        archivedAt: null,
        activity: { archivedAt: null, ...(name ? { name } : {}) },
        campaign: {
          archivedAt: null,
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
        },
      },
      orderBy: { activity: { startAt: "desc" } },
      take: input.take,
      select: {
        campaignActivityId: true,
        activity: { select: { name: true, startAt: true, endAt: true } },
        campaign: {
          select: {
            departmentId: true,
            workspace: { select: { managerId: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      kind,
      id: row.campaignActivityId,
      name: row.activity.name,
      startAt: row.activity.startAt,
      endAt: row.activity.endAt,
      departmentId: row.campaign.departmentId,
      workspaceManagerId: row.campaign.workspace.managerId,
      eventId: null,
    }));
  }

  // ---- assignments ----------------------------------------------------------

  /** Every assignment a talent has, of every status, newest first. */
  async assignmentsForTalent(talentId: string): Promise<AssignmentRow[]> {
    if (!UUID.test(talentId)) return [];
    const [events, productions, promotions] = await Promise.all([
      this.db.eventTalent.findMany({
        where: { talentId },
        include: { ...ASSIGNMENT_INCLUDE.event, ...PEOPLE },
      }),
      this.db.productionTalent.findMany({
        where: { talentId },
        include: { ...ASSIGNMENT_INCLUDE.production, ...PEOPLE },
      }),
      this.db.promotionActivityTalent.findMany({
        where: { talentId },
        include: { ...ASSIGNMENT_INCLUDE.promotion, ...PEOPLE },
      }),
    ]);
    return [
      ...events.map((row) => toEventRow(row)),
      ...productions.map((row) => toProductionRow(row)),
      ...promotions.map((row) => toPromotionRow(row)),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findAssignment(
    talentId: string,
    kind: AssignmentKind,
    id: string,
  ): Promise<AssignmentRow | null> {
    if (!UUID.test(talentId) || !UUID.test(id)) return null;
    if (kind === "EVENT") {
      const row = await this.db.eventTalent.findFirst({
        where: { id, talentId },
        include: { ...ASSIGNMENT_INCLUDE.event, ...PEOPLE },
      });
      return row ? toEventRow(row) : null;
    }
    if (kind === "PRODUCTION") {
      const row = await this.db.productionTalent.findFirst({
        where: { id, talentId },
        include: { ...ASSIGNMENT_INCLUDE.production, ...PEOPLE },
      });
      return row ? toProductionRow(row) : null;
    }
    const row = await this.db.promotionActivityTalent.findFirst({
      where: { id, talentId },
      include: { ...ASSIGNMENT_INCLUDE.promotion, ...PEOPLE },
    });
    return row ? toPromotionRow(row) : null;
  }

  /** Active (ASSIGNED) assignments for several talent at once, for list pages. */
  async activeForTalents(talentIds: string[]): Promise<AssignmentRow[]> {
    const ids = talentIds.filter((id) => UUID.test(id));
    if (ids.length === 0) return [];
    const [events, productions, promotions] = await Promise.all([
      this.db.eventTalent.findMany({
        where: { talentId: { in: ids }, status: "ASSIGNED" },
        include: { ...ASSIGNMENT_INCLUDE.event, ...PEOPLE },
      }),
      this.db.productionTalent.findMany({
        where: { talentId: { in: ids }, status: "ASSIGNED" },
        include: { ...ASSIGNMENT_INCLUDE.production, ...PEOPLE },
      }),
      this.db.promotionActivityTalent.findMany({
        where: { talentId: { in: ids }, status: "ASSIGNED" },
        include: { ...ASSIGNMENT_INCLUDE.promotion, ...PEOPLE },
      }),
    ]);
    return [
      ...events.map((row) => toEventRow(row)),
      ...productions.map((row) => toProductionRow(row)),
      ...promotions.map((row) => toPromotionRow(row)),
    ];
  }

  /** Assignments that still hold the talent (ASSIGNED), with the work they point at. */
  async activeAssignmentsForTalent(talentId: string): Promise<AssignmentRow[]> {
    const all = await this.assignmentsForTalent(talentId);
    return all.filter((row) => row.status === "ASSIGNED");
  }

  /** The id of the talent's ASSIGNED row for a work item, if any. */
  async activeAssignmentId(
    talentId: string,
    kind: AssignmentKind,
    workId: string,
  ): Promise<string | null> {
    if (!UUID.test(talentId) || !UUID.test(workId)) return null;
    if (kind === "EVENT") {
      const row = await this.db.eventTalent.findFirst({
        where: { talentId, eventId: workId, status: "ASSIGNED" },
        select: { id: true },
      });
      return row?.id ?? null;
    }
    if (kind === "PRODUCTION") {
      const row = await this.db.productionTalent.findFirst({
        where: { talentId, productionId: workId, status: "ASSIGNED" },
        select: { id: true },
      });
      return row?.id ?? null;
    }
    const row = await this.db.promotionActivityTalent.findFirst({
      where: { talentId, campaignActivityId: workId, status: "ASSIGNED" },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async hasActiveAssignment(
    talentId: string,
    kind: AssignmentKind,
    workId: string,
  ): Promise<boolean> {
    if (kind === "EVENT") {
      return (
        (await this.db.eventTalent.count({
          where: { talentId, eventId: workId, status: "ASSIGNED" },
        })) > 0
      );
    }
    if (kind === "PRODUCTION") {
      return (
        (await this.db.productionTalent.count({
          where: { talentId, productionId: workId, status: "ASSIGNED" },
        })) > 0
      );
    }
    return (
      (await this.db.promotionActivityTalent.count({
        where: { talentId, campaignActivityId: workId, status: "ASSIGNED" },
      })) > 0
    );
  }

  /** Active assignments across every talent and all three kinds (for the summary). */
  async countAllActive(): Promise<number> {
    const [events, productions, promotions] = await Promise.all([
      this.db.eventTalent.count({ where: { status: "ASSIGNED" } }),
      this.db.productionTalent.count({ where: { status: "ASSIGNED" } }),
      this.db.promotionActivityTalent.count({ where: { status: "ASSIGNED" } }),
    ]);
    return events + productions + promotions;
  }

  /** Number of active assignments across all three kinds (drives the archive rule). */
  async countActiveAssignments(talentId: string): Promise<number> {
    const [events, productions, promotions] = await Promise.all([
      this.db.eventTalent.count({ where: { talentId, status: "ASSIGNED" } }),
      this.db.productionTalent.count({
        where: { talentId, status: "ASSIGNED" },
      }),
      this.db.promotionActivityTalent.count({
        where: { talentId, status: "ASSIGNED" },
      }),
    ]);
    return events + productions + promotions;
  }

  async insertAssignment(
    tx: Tx,
    input: {
      kind: AssignmentKind;
      talentId: string;
      workId: string;
      role: string;
      startAt: Date | null;
      endAt: Date | null;
      notes: string | null;
      assignedById: string;
    },
  ): Promise<string> {
    const common = {
      talentId: input.talentId,
      role: input.role,
      startAt: input.startAt,
      endAt: input.endAt,
      notes: input.notes,
      assignedById: input.assignedById,
    };
    if (input.kind === "EVENT") {
      const row = await tx.eventTalent.create({
        data: { ...common, eventId: input.workId },
        select: { id: true },
      });
      return row.id;
    }
    if (input.kind === "PRODUCTION") {
      const row = await tx.productionTalent.create({
        data: { ...common, productionId: input.workId },
        select: { id: true },
      });
      return row.id;
    }
    const row = await tx.promotionActivityTalent.create({
      data: { ...common, campaignActivityId: input.workId },
      select: { id: true },
    });
    return row.id;
  }

  /** Changes the scheduling or notes of an ASSIGNED row; terminal rows are rejected by the database trigger. */
  async updateAssignment(
    tx: Tx,
    kind: AssignmentKind,
    id: string,
    data: {
      role?: string;
      notes?: string | null;
      startAt?: Date | null;
      endAt?: Date | null;
    },
  ): Promise<void> {
    if (kind === "EVENT") {
      await tx.eventTalent.update({ where: { id }, data });
    } else if (kind === "PRODUCTION") {
      await tx.productionTalent.update({ where: { id }, data });
    } else {
      await tx.promotionActivityTalent.update({ where: { id }, data });
    }
  }

  /** Completes or cancels an ASSIGNED row and stamps who did it and when. */
  async terminateAssignment(
    tx: Tx,
    kind: AssignmentKind,
    id: string,
    input: {
      status: "COMPLETED" | "CANCELLED";
      actorId: string;
      reason: string | null;
      at: Date;
    },
  ): Promise<void> {
    const data =
      input.status === "COMPLETED"
        ? {
            status: "COMPLETED" as const,
            completedAt: input.at,
            completedById: input.actorId,
          }
        : {
            status: "CANCELLED" as const,
            cancelledAt: input.at,
            cancelledById: input.actorId,
            cancelReason: input.reason,
          };
    if (kind === "EVENT") {
      await tx.eventTalent.update({ where: { id }, data });
    } else if (kind === "PRODUCTION") {
      await tx.productionTalent.update({ where: { id }, data });
    } else {
      await tx.promotionActivityTalent.update({ where: { id }, data });
    }
  }

  // ---- history --------------------------------------------------------------

  async recordActivity(
    tx: Tx,
    input: {
      talentId: string;
      type: TalentActivityType;
      assignmentKind?: AssignmentKind;
      assignmentId?: string;
      actorId: string | null;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.talentActivity.create({
      data: {
        talentId: input.talentId,
        type: input.type,
        ...(input.assignmentKind
          ? { assignmentKind: KIND_TO_ENUM[input.assignmentKind] }
          : {}),
        ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
        actorId: input.actorId,
        details: input.details,
      },
    });
  }

  async recordOverride(
    tx: Tx,
    input: {
      talentId: string;
      kind: AssignmentKind;
      assignmentId: string;
      authorizedById: string;
      reason: string | null;
      conflicts: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.talentConflictOverride.create({
      data: {
        talentId: input.talentId,
        assignmentKind: KIND_TO_ENUM[input.kind],
        assignmentId: input.assignmentId,
        authorizedById: input.authorizedById,
        reason: input.reason,
        conflicts: input.conflicts,
      },
    });
  }

  /** Talent history, newest first. */
  async activityForTalent(talentId: string, take = 200) {
    if (!UUID.test(talentId)) return [];
    return this.db.talentActivity.findMany({
      where: { talentId },
      orderBy: { occurredAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        assignmentKind: true,
        assignmentId: true,
        details: true,
        occurredAt: true,
        actor: { select: person },
      },
    });
  }

  // ---- people to notify -----------------------------------------------------

  /**
   * ASSIGNED rows of one work item, read inside the caller's transaction so an
   * archive cancels exactly the assignments that exist when it commits.
   */
  async activeAssignmentsForWork(
    tx: Tx,
    kind: AssignmentKind,
    workId: string,
  ): Promise<{ id: string; talentId: string; talentName: string }[]> {
    const select = {
      id: true,
      talentId: true,
      talent: { select: { fullName: true } },
    } as const;
    const rows =
      kind === "EVENT"
        ? await tx.eventTalent.findMany({
            where: { eventId: workId, status: "ASSIGNED" },
            select,
          })
        : kind === "PRODUCTION"
          ? await tx.productionTalent.findMany({
              where: { productionId: workId, status: "ASSIGNED" },
              select,
            })
          : await tx.promotionActivityTalent.findMany({
              where: { campaignActivityId: workId, status: "ASSIGNED" },
              select,
            });
    return rows.map((row) => ({
      id: row.id,
      talentId: row.talentId,
      talentName: row.talent.fullName,
    }));
  }

  /** The talent's manager and the work's responsible manager, merged and de-duplicated. */
  async notificationRecipients(
    talentId: string,
    workspaceManagerId: string | null,
  ): Promise<string[]> {
    const talent = await this.db.talent.findUnique({
      where: { id: talentId },
      select: { managerId: true },
    });
    return [
      ...new Set(
        [talent?.managerId, workspaceManagerId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ];
  }

  /** Display names for a talent, captured into outbox payloads at write time. */
  async talentName(talentId: string): Promise<string | null> {
    const talent = await this.db.talent.findUnique({
      where: { id: talentId },
      select: { fullName: true },
    });
    return talent?.fullName ?? null;
  }
}

const ASSIGNMENT_INCLUDE = {
  event: {
    event: {
      select: {
        id: true,
        name: true,
        startAt: true,
        endAt: true,
        departmentId: true,
        workspace: { select: { managerId: true } },
      },
    },
  },
  production: {
    production: {
      select: {
        id: true,
        name: true,
        startAt: true,
        endAt: true,
        departmentId: true,
        workspace: { select: { managerId: true } },
      },
    },
  },
  promotion: {
    promotionActivity: {
      select: {
        campaignActivityId: true,
        activity: { select: { name: true, startAt: true, endAt: true } },
        campaign: {
          select: {
            departmentId: true,
            workspace: { select: { managerId: true } },
          },
        },
      },
    },
  },
} as const;

const PEOPLE = {
  assignedBy: { select: person },
  completedBy: { select: person },
  cancelledBy: { select: person },
} as const;

interface Common {
  id: string;
  workName: string | null;
  talentId: string;
  role: string;
  status: TalentAssignmentStatus;
  notes: string | null;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  assignedBy: PersonRef | null;
  completedBy: PersonRef | null;
  cancelledBy: PersonRef | null;
}

function toRow(
  kind: AssignmentKind,
  common: Common,
  work: WorkItem,
  workId: string,
): AssignmentRow {
  return {
    kind,
    workName: common.workName ?? work.name,
    id: common.id,
    talentId: common.talentId,
    workId,
    work,
    role: common.role,
    status: common.status,
    notes: common.notes,
    startAt: common.startAt,
    endAt: common.endAt,
    createdAt: common.createdAt,
    updatedAt: common.updatedAt,
    completedAt: common.completedAt,
    cancelledAt: common.cancelledAt,
    cancelReason: common.cancelReason,
    assignedBy: common.assignedBy,
    completedBy: common.completedBy,
    cancelledBy: common.cancelledBy,
  };
}

function toEventRow(
  row: Omit<Common, "createdAt"> & { assignedAt: Date } & {
    event: {
      id: string;
      name: string;
      startAt: Date | null;
      endAt: Date | null;
      departmentId: string | null;
      workspace: { managerId: string | null };
    };
  },
): AssignmentRow {
  const work: WorkItem = {
    kind: "EVENT",
    id: row.event.id,
    name: row.event.name,
    startAt: row.event.startAt,
    endAt: row.event.endAt,
    departmentId: row.event.departmentId,
    workspaceManagerId: row.event.workspace.managerId,
    eventId: row.event.id,
  };
  return toRow(
    "EVENT",
    { ...row, createdAt: row.assignedAt },
    work,
    row.event.id,
  );
}

function toProductionRow(
  row: Common & {
    production: {
      id: string;
      name: string;
      startAt: Date | null;
      endAt: Date | null;
      departmentId: string | null;
      workspace: { managerId: string | null };
    };
  },
): AssignmentRow {
  const work: WorkItem = {
    kind: "PRODUCTION",
    id: row.production.id,
    name: row.production.name,
    startAt: row.production.startAt,
    endAt: row.production.endAt,
    departmentId: row.production.departmentId,
    workspaceManagerId: row.production.workspace.managerId,
    eventId: null,
  };
  return toRow("PRODUCTION", row, work, row.production.id);
}

function toPromotionRow(
  row: Common & {
    promotionActivity: {
      campaignActivityId: string;
      activity: { name: string; startAt: Date | null; endAt: Date | null };
      campaign: {
        departmentId: string | null;
        workspace: { managerId: string | null };
      };
    };
  },
): AssignmentRow {
  const work: WorkItem = {
    kind: "PROMOTION",
    id: row.promotionActivity.campaignActivityId,
    name: row.promotionActivity.activity.name,
    startAt: row.promotionActivity.activity.startAt,
    endAt: row.promotionActivity.activity.endAt,
    departmentId: row.promotionActivity.campaign.departmentId,
    workspaceManagerId: row.promotionActivity.campaign.workspace.managerId,
    eventId: null,
  };
  return toRow(
    "PROMOTION",
    row,
    work,
    row.promotionActivity.campaignActivityId,
  );
}
