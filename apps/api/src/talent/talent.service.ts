import {
  ConflictException,
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
import {
  canTransitionAssignment,
  canTransitionAvailability,
} from "./talent.lifecycle.js";
import {
  talentAssignmentNotFound,
  talentAssignmentTransitionInvalid,
  talentAvailabilityTransitionInvalid,
  talentManagerNotFound,
  talentScheduleInvalid,
  talentScheduleNotFound,
  talentSocialLinkConflict,
  talentSocialLinkNotFound,
  talentNotFound,
} from "./talent.errors.js";
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

function response(value: TalentRecord): TalentResponse {
  return {
    ...value,
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
  async list(
    userId: string,
    query: ListTalentsQueryDto,
  ): Promise<PaginatedTalentsResponse> {
    await this.grant(userId, "talent.read");
    const { items, total } = await this.repository.list({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.availability ? { availability: query.availability } : {}),
      ...(query.managerId ? { managerId: query.managerId } : {}),
    });
    return {
      items: items.map(response),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
  async get(userId: string, id: string) {
    await this.grant(userId, "talent.read");
    return response(await this.load(id));
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
    });
    if (value === "manager_not_found") throw talentManagerNotFound();
    return response(value);
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
    return response(value!);
  }
  async setManager(userId: string, id: string, dto: SetTalentManagerDto) {
    await this.grant(userId, "talent.update");
    await this.load(id);
    const value = await this.repository.setManager(id, dto.managerId ?? null);
    if (value === "manager_not_found") throw talentManagerNotFound();
    if (!value) throw talentNotFound();
    return response(value);
  }
  async transition(
    userId: string,
    id: string,
    availability: TalentAvailability,
  ) {
    await this.grant(userId, "talent.transition_status");
    const current = await this.load(id);
    if (!canTransitionAvailability(current.availability, availability))
      throw talentAvailabilityTransitionInvalid(
        current.availability,
        availability,
      );
    const value = await this.repository.setAvailability(id, availability);
    if (!value) throw talentNotFound();
    return response(value);
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
    return response(value);
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
    return response(value);
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
    return response(value);
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
  async assignEvent(
    userId: string,
    talentId: string,
    dto: CreateEventTalentAssignmentDto,
  ) {
    await this.grant(userId, "talent.assign");
    await this.load(talentId);
    const value = await this.repository.createEventAssignment(
      talentId,
      dto.eventId,
      dto.role.trim(),
    );
    if (value === "conflict")
      throw new ConflictException({
        code: "TALENT_EVENT_ASSIGNMENT_CONFLICT",
        detail: "The talent is already assigned to this event.",
      });
    if (value === "event_not_found")
      throw new NotFoundException({
        code: "EVENT_NOT_FOUND",
        detail: "The event does not exist.",
      });
    if (!value) throw talentNotFound();
    return response(value);
  }
  async transitionAssignment(
    userId: string,
    talentId: string,
    id: string,
    status: TalentAssignmentStatus,
  ) {
    await this.grant(userId, "talent.assign");
    await this.load(talentId);
    const current = await this.repository.assignmentStatus(talentId, id);
    if (!current) throw talentAssignmentNotFound();
    if (!canTransitionAssignment(current, status))
      throw talentAssignmentTransitionInvalid(current, status);
    const value = await this.repository.transitionAssignment(
      talentId,
      id,
      status,
    );
    if (!value) throw talentAssignmentNotFound();
    return response(value);
  }
}
