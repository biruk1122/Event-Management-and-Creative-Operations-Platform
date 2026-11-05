import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type {
  PermissionScope,
  TalentAssignmentStatus,
  TalentAvailability,
} from "../generated/prisma/client.js";
import { permissionDenied } from "../common/security/security.errors.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { canTransitionAvailability } from "./talent.lifecycle.js";
import {
  talentAssignmentTransitionInvalid,
  talentAvailabilityTransitionInvalid,
  talentManagerNotFound,
  talentScheduleInvalid,
  talentScheduleNotFound,
  talentSocialLinkConflict,
  talentSocialLinkNotFound,
  talentHasActiveAssignments,
  talentNotFound,
} from "./talent.errors.js";
import { TalentAccessService } from "./talent-access.service.js";
import type { AssignmentRow } from "./infrastructure/talent-assignments.repository.js";
import type {
  TalentCurrentAssignmentResponse,
  TalentSummaryResponse,
} from "./talent.contracts.js";
import { TalentAssignmentsRepository } from "./infrastructure/talent-assignments.repository.js";
import { TalentAssignmentsService } from "./talent-assignments.service.js";
import type {
  TalentResponse,
  PaginatedTalentsResponse,
} from "./talent.contracts.js";
import {
  TalentRepository,
  type TalentRecord,
} from "./infrastructure/talent.repository.js";
import type { CreateTalentDto } from "./dto/create-talent.dto.js";
import type { UpdateTalentDto } from "./dto/update-talent.dto.js";
import type { ListTalentsQueryDto } from "./dto/list-talents-query.dto.js";
import type { SetTalentManagerDto } from "./dto/set-talent-manager.dto.js";
import type { CreateTalentSocialLinkDto } from "./dto/create-talent-social-link.dto.js";
import type { CreateTalentScheduleDto } from "./dto/create-talent-schedule.dto.js";
import type { UpdateTalentScheduleDto } from "./dto/update-talent-schedule.dto.js";
import type { CreateEventTalentAssignmentDto } from "./dto/create-event-talent-assignment.dto.js";

/** The active-assignment summary every talent response carries. */
interface AssignmentSummary {
  activeAssignmentCount: number;
  currentAssignment: TalentCurrentAssignmentResponse | null;
}

/** Counts a talent's active assignments and picks the one that matters now. */
function summarize(
  rows: readonly AssignmentRow[],
  now: Date,
): AssignmentSummary {
  const active = rows.filter((row) => row.status === "ASSIGNED");
  const ranked = active
    .map((row) => {
      const startAt = row.startAt ?? row.work.startAt;
      const phase = startAt && startAt > now ? "upcoming" : "active";
      return { row, startAt, phase } as const;
    })
    .sort((a, b) => {
      if (a.phase !== b.phase) return a.phase === "active" ? -1 : 1;
      return (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0);
    });
  const first = ranked[0];
  return {
    activeAssignmentCount: active.length,
    currentAssignment: first
      ? {
          kind: first.row.kind,
          id: first.row.id,
          workName: first.row.workName,
          startAt: iso(first.row.startAt),
          endAt: iso(first.row.endAt),
          phase: first.phase,
        }
      : null,
  };
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function response(
  value: TalentRecord,
  summary: AssignmentSummary = {
    activeAssignmentCount: 0,
    currentAssignment: null,
  },
): TalentResponse {
  return {
    ...value,
    ...summary,
    profileImageUrl: value.profileImageId
      ? `/api/v1/talents/${value.id}/profile-image/content?v=${value.profileImageId}`
      : null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    schedules: value.schedules.map((item) => ({
      ...item,
      startAt: item.startAt.toISOString(),
      endAt: item.endAt.toISOString(),
    })),
    eventAssignments: value.eventAssignments.map((item) => ({
      ...item,
      assignedAt: item.assignedAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

@Injectable()
export class TalentService {
  constructor(
    private readonly repository: TalentRepository,
    private readonly permissions: PermissionsService,
    private readonly access: TalentAccessService,
    private readonly assignments: TalentAssignmentsRepository,
    private readonly assignmentService: TalentAssignmentsService,
  ) {}
  private async grant(
    userId: string,
    key: string,
    scope: PermissionScope = "ORGANIZATION",
  ) {
    if (!(await this.permissions.hasGrant(userId, key, scope)))
      throw permissionDenied();
  }
  private async load(id: string) {
    const value = await this.repository.findById(id);
    if (!value) throw talentNotFound();
    return value;
  }
  /** Directory summary tiles. Visible to everyone who can read the directory; counts hide no contact data. */
  async summary(userId: string): Promise<TalentSummaryResponse> {
    await this.directoryMode(userId);
    const [counts, activeAssignments] = await Promise.all([
      this.repository.summaryCounts(),
      this.assignments.countAllActive(),
    ]);
    const byAvailability = {
      AVAILABLE: 0,
      ASSIGNED: 0,
      UNAVAILABLE: 0,
      INACTIVE: 0,
    };
    for (const row of counts.byAvailability) {
      byAvailability[row.availability] = row.count;
    }
    return {
      total: counts.total,
      byAvailability,
      assignedTalents: counts.assignedTalents,
      activeAssignments,
    };
  }

  /** A single talent's response, with its active-assignment summary. */
  private async view(value: TalentRecord): Promise<TalentResponse> {
    const rows = await this.assignments.activeForTalents([value.id]);
    return response(value, summarize(rows, new Date()));
  }

  async list(
    userId: string,
    query: ListTalentsQueryDto,
  ): Promise<PaginatedTalentsResponse> {
    const mode = await this.directoryMode(userId);
    const { items, total } = await this.repository.list({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.availability ? { availability: query.availability } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
      ...(query.assignment ? { assignment: query.assignment } : {}),
      sort: query.sort ?? "name",
    });
    // One batch for the whole page, so the list never queries per row.
    const activeRows = await this.assignments.activeForTalents(
      items.map((item) => item.id),
    );
    return {
      items: items.map((item) =>
        presentFor(
          mode,
          response(
            item,
            summarize(
              activeRows.filter((row) => row.talentId === item.id),
              new Date(),
            ),
          ),
        ),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
  async get(userId: string, id: string) {
    const mode = await this.directoryMode(userId);
    return presentFor(mode, await this.view(await this.load(id)));
  }

  /** Organization talent readers see everything; Production Managers see talent with contact details hidden. */
  private async directoryMode(userId: string): Promise<"full" | "masked"> {
    const mode = await this.access.directoryMode(userId);
    if (!mode) throw permissionDenied();
    return mode;
  }
  async create(userId: string, dto: CreateTalentDto) {
    await this.grant(userId, "talent.create");
    const value = await this.repository.create({
      fullName: dto.fullName.trim(),
      type: dto.type,
      ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
      ...(dto.phone ? { phone: dto.phone.trim() } : {}),
      ...(dto.biography ? { biography: dto.biography.trim() } : {}),
      ...(dto.managerId ? { managerId: dto.managerId } : {}),
      ...(dto.availability ? { availability: dto.availability } : {}),
      ...(dto.socialLink
        ? {
            socialLink: {
              label: dto.socialLink.label.trim(),
              url: dto.socialLink.url.trim(),
            },
          }
        : {}),
    });
    if (value === "manager_not_found") throw talentManagerNotFound();
    return this.view(value);
  }
  async update(userId: string, id: string, dto: UpdateTalentDto) {
    await this.grant(userId, "talent.update");
    await this.load(id);
    const value = await this.repository.update(id, {
      ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.email !== undefined
        ? { email: dto.email?.trim().toLowerCase() ?? null }
        : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone?.trim() ?? null } : {}),
      ...(dto.biography !== undefined
        ? { biography: dto.biography?.trim() ?? null }
        : {}),
    });
    return this.view(value!);
  }
  async setManager(userId: string, id: string, dto: SetTalentManagerDto) {
    await this.grant(userId, "talent.update");
    await this.load(id);
    const value = await this.repository.setManager(id, dto.managerId ?? null);
    if (value === "manager_not_found") throw talentManagerNotFound();
    if (!value) throw talentNotFound();
    return this.view(value);
  }
  async transition(
    userId: string,
    id: string,
    availability: TalentAvailability,
  ) {
    await this.grant(userId, "talent.transition_status");
    const current = await this.load(id);
    // Archiving (INACTIVE) is refused while the talent still holds active work.
    if (
      availability === "INACTIVE" &&
      (await this.assignments.countActiveAssignments(id)) > 0
    )
      throw talentHasActiveAssignments();
    if (!canTransitionAvailability(current.availability, availability))
      throw talentAvailabilityTransitionInvalid(
        current.availability,
        availability,
      );
    const value = await this.repository.setAvailability(id, availability);
    if (!value) throw talentNotFound();
    return this.view(value);
  }
  async addSocialLink(
    userId: string,
    id: string,
    dto: CreateTalentSocialLinkDto,
  ) {
    await this.grant(userId, "talent.update");
    await this.load(id);
    const value = await this.repository.createSocialLink(
      id,
      dto.label.trim(),
      dto.url.trim(),
    );
    if (value === "conflict") throw talentSocialLinkConflict();
    if (!value) throw talentNotFound();
    return this.view(value);
  }
  async removeSocialLink(
    userId: string,
    talentId: string,
    id: string,
  ): Promise<void> {
    await this.grant(userId, "talent.update");
    await this.load(talentId);
    if (!(await this.repository.deleteSocialLink(talentId, id)))
      throw talentSocialLinkNotFound();
  }
  async addSchedule(userId: string, id: string, dto: CreateTalentScheduleDto) {
    await this.grant(userId, "talent.manage_activities");
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw talentScheduleInvalid();
    const value = await this.repository.createSchedule(
      id,
      dto.title.trim(),
      startAt,
      endAt,
    );
    if (!value) throw talentNotFound();
    return this.view(value);
  }
  async updateSchedule(
    userId: string,
    talentId: string,
    id: string,
    dto: UpdateTalentScheduleDto,
  ) {
    await this.grant(userId, "talent.manage_activities");
    const current = await this.load(talentId);
    const existing = current.schedules.find((item) => item.id === id);
    if (!existing) throw talentScheduleNotFound();
    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    if (endAt <= startAt) throw talentScheduleInvalid();
    const value = await this.repository.updateSchedule(talentId, id, {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.startAt ? { startAt } : {}),
      ...(dto.endAt ? { endAt } : {}),
    });
    if (!value) throw talentScheduleNotFound();
    return this.view(value);
  }
  async removeSchedule(
    userId: string,
    talentId: string,
    id: string,
  ): Promise<void> {
    await this.grant(userId, "talent.manage_activities");
    await this.load(talentId);
    if (!(await this.repository.deleteSchedule(talentId, id)))
      throw talentScheduleNotFound();
  }
  /**
   * Legacy event-assignment route. It delegates to the one assignment service,
   * so conflicts, overrides, duplicates, history and audit behave exactly as on
   * the assignment API. Only the error codes are mapped to the names the
   * existing clients expect.
   */
  async assignEvent(
    userId: string,
    talentId: string,
    dto: CreateEventTalentAssignmentDto,
    requestId: string,
  ) {
    try {
      await this.assignmentService.create(
        userId,
        talentId,
        {
          kind: "EVENT",
          workId: dto.eventId,
          role: dto.role,
          notes: dto.notes ?? null,
          // Omitted dates keep the work item's dates; only supplied values are sent.
          ...(dto.startAt !== undefined ? { startAt: dto.startAt } : {}),
          ...(dto.endAt !== undefined ? { endAt: dto.endAt } : {}),
          acknowledgeConflicts: dto.acknowledgeConflicts ?? false,
          overrideReason: dto.overrideReason ?? null,
        },
        requestId,
      );
    } catch (error) {
      throw legacyAssignmentError(error);
    }
    return this.view(await this.load(talentId));
  }

  async transitionAssignment(
    userId: string,
    talentId: string,
    id: string,
    status: TalentAssignmentStatus,
    reason: string | undefined,
    requestId: string,
  ) {
    if (status !== "COMPLETED" && status !== "CANCELLED") {
      throw talentAssignmentTransitionInvalid("ASSIGNED", status);
    }
    await this.assignmentService.transition(
      userId,
      talentId,
      "EVENT",
      id,
      { status, ...(reason ? { reason } : {}) },
      requestId,
    );
    return this.view(await this.load(talentId));
  }
}

/** Maps the assignment service's codes to the legacy event-assignment codes. */
function legacyAssignmentError(error: unknown): unknown {
  if (!(error instanceof HttpException)) return error;
  const code = (error.getResponse() as { code?: string }).code;
  if (code === "TALENT_ASSIGNMENT_DUPLICATE") {
    return new ConflictException({
      code: "TALENT_EVENT_ASSIGNMENT_CONFLICT",
      detail: "The talent is already assigned to this event.",
    });
  }
  if (code === "TALENT_WORK_NOT_FOUND") {
    return new NotFoundException({
      code: "EVENT_NOT_FOUND",
      detail: "The event does not exist.",
    });
  }
  return error;
}

/** Hides contact details from readers who see talent only for their own work (Production Managers). */
function presentFor(
  mode: "full" | "masked",
  talent: TalentResponse,
): TalentResponse {
  if (mode === "full") return talent;
  return { ...talent, email: null, phone: null, socialLinks: [] };
}
