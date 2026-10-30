import { Injectable } from "@nestjs/common";

import {
  MeetingStatus,
  MeetingType,
  TaskType,
  type PermissionScope,
} from "../generated/prisma/client.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { TaskResponse } from "../tasks/tasks.contracts.js";
import { TasksService } from "../tasks/tasks.service.js";
import type { CheckMeetingAvailabilityDto } from "./dto/check-meeting-availability.dto.js";
import type { CreateMeetingActionItemDto } from "./dto/create-meeting-action-item.dto.js";
import type { CreateMeetingDto } from "./dto/create-meeting.dto.js";
import type { ListMeetingsQueryDto } from "./dto/list-meetings-query.dto.js";
import type { UpdateMeetingDto } from "./dto/update-meeting.dto.js";
import type {
  MeetingAcknowledgementResponse,
  MeetingAvailabilityResponse,
  MeetingResponse,
  PaginatedMeetingsResponse,
} from "./meetings.contracts.js";
import {
  meetingCancelled,
  meetingInvalidTransition,
  meetingNotFound,
  meetingNotOnline,
  meetingNotScheduled,
  meetingOrganizerParticipant,
  meetingParticipantAlreadyInvited,
  meetingParticipantNotFound,
  meetingResponseAlreadyAcknowledged,
  meetingScheduleInvalid,
  meetingUserNotFound,
  meetingVenueInvalid,
  meetingWorkspaceNotFound,
} from "./meetings.errors.js";
import { canTransitionMeeting } from "./meetings.lifecycle.js";
import { JitsiService } from "./jitsi/jitsi.service.js";
import type { MeetingJitsiSessionResponse } from "./meetings.contracts.js";
import {
  MeetingsRepository,
  type MeetingRecord,
  type MeetingVisibility,
  type UpdateMeetingFields,
} from "./infrastructure/meetings.repository.js";

@Injectable()
export class MeetingsService {
  constructor(
    private readonly repository: MeetingsRepository,
    private readonly permissions: PermissionsService,
    private readonly tasks: TasksService,
    private readonly jitsi: JitsiService,
  ) {}

  private hasGrant(
    userId: string,
    key: string,
    scope: PermissionScope,
  ): Promise<boolean> {
    return this.permissions.hasGrant(userId, key, scope);
  }

  private async visibilityFor(userId: string): Promise<MeetingVisibility> {
    const [organization, department, self] = await Promise.all([
      this.hasGrant(userId, "meeting.read", "ORGANIZATION"),
      this.hasGrant(userId, "meeting.read", "DEPARTMENT"),
      this.hasGrant(userId, "meeting.read", "SELF"),
    ]);
    if (!organization && !department && !self) throw permissionDenied();
    const departmentId = department
      ? await this.repository.findUserDepartmentId(userId)
      : null;
    return {
      organization,
      ...(departmentId ? { departmentId } : {}),
      ...(self ? { selfUserId: userId } : {}),
    };
  }

  private async requireOrganizerUpdateGrant(
    userId: string,
    meeting: MeetingRecord,
  ): Promise<void> {
    if (meeting.organizer.id !== userId) throw permissionDenied();
    if (await this.hasGrant(userId, "meeting.update", "ORGANIZATION")) return;
    if (await this.hasGrant(userId, "meeting.update", "DEPARTMENT")) {
      if (await this.repository.findUserDepartmentId(userId)) return;
    }
    throw permissionDenied();
  }

  async list(
    userId: string,
    query: ListMeetingsQueryDto,
  ): Promise<PaginatedMeetingsResponse> {
    const visibility = await this.visibilityFor(userId);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from >= to) throw meetingScheduleInvalid();
    const { items, total } = await this.repository.list({
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map(toMeetingResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(userId: string, id: string): Promise<MeetingResponse> {
    const visibility = await this.visibilityFor(userId);
    const meeting = await this.repository.findVisibleById(id, visibility);
    if (!meeting) {
      if (visibility.organization) throw meetingNotFound();
      throw permissionDenied();
    }
    return toMeetingResponse(meeting);
  }

  async create(
    userId: string,
    dto: CreateMeetingDto,
    requestId: string,
  ): Promise<MeetingResponse> {
    const organization = await this.hasGrant(
      userId,
      "meeting.create",
      "ORGANIZATION",
    );
    const department = await this.hasGrant(
      userId,
      "meeting.create",
      "DEPARTMENT",
    );
    if (!organization && !department) throw permissionDenied();
    if (
      !organization &&
      !(await this.repository.findUserDepartmentId(userId))
    ) {
      throw permissionDenied();
    }
    if (dto.workspaceId) {
      if (!(await this.repository.workspaceExists(dto.workspaceId)))
        throw meetingWorkspaceNotFound();
      if (
        !organization &&
        !(await this.repository.workspaceAccessibleToUser(
          dto.workspaceId,
          userId,
        ))
      ) {
        throw permissionDenied();
      }
    }
    if (dto.participantIds.includes(userId))
      throw meetingOrganizerParticipant();
    if (!(await this.repository.activeUsersExist(dto.participantIds)))
      throw meetingUserNotFound();
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const reminderAt = dto.reminderAt ? new Date(dto.reminderAt) : undefined;
    assertSchedule(startAt, endAt, reminderAt ?? null);
    assertVenue(dto.type, dto.location);
    const meeting = await this.repository.create({
      title: dto.title.trim(),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      type: dto.type,
      organizerId: userId,
      ...(dto.workspaceId ? { workspaceId: dto.workspaceId } : {}),
      startAt,
      endAt,
      ...(dto.location ? { location: dto.location.trim() } : {}),
      ...(reminderAt ? { reminderAt } : {}),
      ...(dto.agenda !== undefined ? { agenda: dto.agenda.trim() } : {}),
      participantIds: dto.participantIds,
      correlationId: requestId,
    });
    return toMeetingResponse(meeting);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateMeetingDto,
  ): Promise<MeetingResponse> {
    const meeting = await this.repository.findById(id);
    if (!meeting) throw meetingNotFound();
    await this.requireOrganizerUpdateGrant(userId, meeting);
    if (meeting.status === MeetingStatus.CANCELLED) throw meetingCancelled();
    const startAt = dto.startAt ? new Date(dto.startAt) : meeting.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : meeting.endAt;
    const reminderAt =
      dto.reminderAt === undefined
        ? meeting.reminderAt
        : dto.reminderAt === null
          ? null
          : new Date(dto.reminderAt);
    const type = dto.type ?? meeting.type;
    const location = cleanNullable(dto.location, meeting.location);
    assertSchedule(startAt, endAt, reminderAt);
    assertVenue(type, location);
    const fields: UpdateMeetingFields = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: cleanNullable(dto.description, null) }
        : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.startAt !== undefined ? { startAt } : {}),
      ...(dto.endAt !== undefined ? { endAt } : {}),
      ...(dto.location !== undefined ? { location } : {}),
      ...(dto.reminderAt !== undefined ? { reminderAt } : {}),
      ...(dto.agenda !== undefined
        ? { agenda: cleanNullable(dto.agenda, null) }
        : {}),
    };
    const result = await this.repository.update(id, userId, fields);
    if (result === "not_found") throw meetingNotFound();
    if (result === "forbidden") throw permissionDenied();
    if (result === "cancelled") throw meetingCancelled();
    return toMeetingResponse(result);
  }

  async remove(userId: string, id: string): Promise<void> {
    const meeting = await this.repository.findById(id);
    if (!meeting) throw meetingNotFound();
    await this.requireOrganizerUpdateGrant(userId, meeting);
    const result = await this.repository.remove(id, userId);
    if (result === "not_found") throw meetingNotFound();
    if (result === "forbidden") throw permissionDenied();
  }

  /** Minutes can be recorded for SCHEDULED or COMPLETED meetings. */
  async setMinutes(
    userId: string,
    id: string,
    minutes: string,
  ): Promise<MeetingResponse> {
    const meeting = await this.repository.findById(id);
    if (!meeting) throw meetingNotFound();
    await this.requireOrganizerUpdateGrant(userId, meeting);
    const result = await this.repository.setMinutes(id, userId, minutes.trim());
    if (result === "not_found") throw meetingNotFound();
    if (result === "forbidden") throw permissionDenied();
    if (result === "cancelled") throw meetingCancelled();
    return toMeetingResponse(result);
  }

  async addParticipant(
    userId: string,
    id: string,
    participantUserId: string,
    requestId: string,
  ): Promise<MeetingResponse> {
    const meeting = await this.repository.findById(id);
    if (!meeting) throw meetingNotFound();
    await this.requireOrganizerUpdateGrant(userId, meeting);
    if (participantUserId === userId) throw meetingOrganizerParticipant();
    const result = await this.repository.addParticipant(
      id,
      userId,
      participantUserId,
      requestId,
    );
    if (result === "not_found") throw meetingNotFound();
    if (result === "forbidden") throw permissionDenied();
    if (result === "not_scheduled") throw meetingNotScheduled();
    if (result === "user_not_found") throw meetingUserNotFound();
    if (result === "already_invited") throw meetingParticipantAlreadyInvited();
    return toMeetingResponse(result);
  }

  async removeParticipant(
    userId: string,
    id: string,
    participantUserId: string,
  ): Promise<MeetingResponse> {
    const meeting = await this.repository.findById(id);
    if (!meeting) throw meetingNotFound();
    await this.requireOrganizerUpdateGrant(userId, meeting);
    const result = await this.repository.removeParticipant(
      id,
      userId,
      participantUserId,
    );
    if (result === "not_found") throw meetingNotFound();
    if (result === "forbidden") throw permissionDenied();
    if (result === "not_scheduled") throw meetingNotScheduled();
    if (result === "not_invited") throw meetingParticipantNotFound();
    return toMeetingResponse(result);
  }

  async respond(
    userId: string,
    id: string,
    response: "ACCEPTED" | "DECLINED",
  ): Promise<MeetingAcknowledgementResponse> {
    if (!(await this.hasGrant(userId, "meeting.respond", "SELF")))
      throw permissionDenied();
    const result = await this.repository.respond(id, userId, response);
    if (result === "not_found") throw meetingNotFound();
    if (result === "not_scheduled") throw meetingNotScheduled();
    if (result === "not_invited") throw permissionDenied();
    if (result === "already_acknowledged")
      throw meetingResponseAlreadyAcknowledged();
    return {
      meetingId: id,
      response: result.response,
      respondedAt: result.respondedAt.toISOString(),
    };
  }

  /** Authorization for Jitsi room-join info is deliberately stricter than
   * `meeting.read`'s own DEPARTMENT/ORGANIZATION reach: holding a broad read
   * grant lets a caller *see* a meeting without being invited to it, but
   * must not be enough to reveal room-join information - only the organizer
   * or an actual invited participant unlocks it. The room name itself isn't
   * treated as a secret (see JitsiService); this check is the real
   * authorization boundary. */
  async getJitsiSession(
    userId: string,
    id: string,
  ): Promise<MeetingJitsiSessionResponse> {
    const organization = await this.hasGrant(
      userId,
      "meeting.read",
      "ORGANIZATION",
    );
    const department = await this.hasGrant(
      userId,
      "meeting.read",
      "DEPARTMENT",
    );
    const self = await this.hasGrant(userId, "meeting.read", "SELF");
    if (!organization && !department && !self) throw permissionDenied();
    const meeting = await this.repository.findById(id);
    if (!meeting) throw meetingNotFound();
    if (meeting.type === MeetingType.PHYSICAL) throw meetingNotOnline();
    const isOrganizer = meeting.organizer.id === userId;
    const participant = meeting.participants.find(
      (candidate) => candidate.id === userId,
    );
    if (!isOrganizer && !participant) throw permissionDenied();
    return this.jitsi.buildSession(meeting, {
      userId,
      isOrganizer,
      participant,
    });
  }

  async transition(
    userId: string,
    id: string,
    status: "COMPLETED" | "CANCELLED",
  ): Promise<MeetingResponse> {
    const meeting = await this.repository.findById(id);
    if (!meeting) throw meetingNotFound();
    await this.requireOrganizerUpdateGrant(userId, meeting);
    if (!canTransitionMeeting(meeting.status, status))
      throw meetingInvalidTransition();
    const result = await this.repository.transition(id, userId, status);
    if (result === "not_found") throw meetingNotFound();
    if (result === "forbidden") throw permissionDenied();
    if (result === "invalid_transition") throw meetingInvalidTransition();
    return toMeetingResponse(result);
  }

  /** A thin wrapper over `TasksService.create` (EOM-01): the task's
   * workspace/department is resolved server-side - the meeting's own
   * workspace if it has one, otherwise the organizer's own department -
   * never from client input. Linked back via `Task.sourceMeetingId`. */
  async createActionItem(
    userId: string,
    meetingId: string,
    dto: CreateMeetingActionItemDto,
    requestId: string,
  ): Promise<TaskResponse> {
    const meeting = await this.repository.findById(meetingId);
    if (!meeting) throw meetingNotFound();
    await this.requireOrganizerUpdateGrant(userId, meeting);
    const departmentId = meeting.workspaceId
      ? undefined
      : ((await this.repository.findUserDepartmentId(userId)) ?? undefined);
    if (!meeting.workspaceId && !departmentId) throw permissionDenied();
    const task = await this.tasks.create(
      userId,
      {
        title: dto.title,
        type: TaskType.GENERAL,
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(meeting.workspaceId ? { workspaceId: meeting.workspaceId } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(dto.dueAt ? { dueAt: dto.dueAt } : {}),
      },
      requestId,
    );
    await this.repository.linkActionItem(task.id, meetingId);
    if (!dto.assigneeId) return task;
    return this.tasks.addAssignee(userId, task.id, dto.assigneeId, requestId);
  }

  async availability(
    userId: string,
    dto: CheckMeetingAvailabilityDto,
  ): Promise<MeetingAvailabilityResponse> {
    const organization = await this.hasGrant(
      userId,
      "meeting.read",
      "ORGANIZATION",
    );
    const department = await this.hasGrant(
      userId,
      "meeting.read",
      "DEPARTMENT",
    );
    if (!organization && !department) throw permissionDenied();
    if (!organization) {
      const departmentId = await this.repository.findUserDepartmentId(userId);
      if (
        !departmentId ||
        !(await this.repository.activeUsersBelongToDepartment(
          dto.userIds,
          departmentId,
        ))
      ) {
        throw permissionDenied();
      }
    }
    if (!(await this.repository.activeUsersExist(dto.userIds)))
      throw meetingUserNotFound();
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    assertSchedule(startAt, endAt, null);
    const counts = await this.repository.availability(
      dto.userIds,
      startAt,
      endAt,
      dto.excludeMeetingId,
    );
    return {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      users: dto.userIds.map((targetUserId) => ({
        userId: targetUserId,
        available: (counts.get(targetUserId) ?? 0) === 0,
        conflictingMeetingCount: counts.get(targetUserId) ?? 0,
      })),
    };
  }
}

function cleanNullable(
  value: string | null | undefined,
  fallback: string | null,
): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function assertSchedule(
  startAt: Date,
  endAt: Date,
  reminderAt: Date | null,
): void {
  if (endAt <= startAt || (reminderAt !== null && reminderAt > startAt))
    throw meetingScheduleInvalid();
}

function assertVenue(type: MeetingType, location?: string | null): void {
  const hasLocation = Boolean(location?.trim());
  if (
    (type === MeetingType.PHYSICAL && !hasLocation) ||
    (type === MeetingType.ONLINE && hasLocation) ||
    (type === MeetingType.HYBRID && !hasLocation)
  ) {
    throw meetingVenueInvalid();
  }
}

function toMeetingResponse(meeting: MeetingRecord): MeetingResponse {
  return {
    id: meeting.id,
    workspaceId: meeting.workspaceId,
    title: meeting.title,
    description: meeting.description,
    type: meeting.type,
    status: meeting.status,
    organizer: meeting.organizer,
    startAt: meeting.startAt.toISOString(),
    endAt: meeting.endAt.toISOString(),
    location: meeting.location,
    reminderAt: meeting.reminderAt?.toISOString() ?? null,
    agenda: meeting.agenda,
    minutes: meeting.minutes,
    participants: meeting.participants.map((participant) => ({
      id: participant.id,
      email: participant.email,
      firstName: participant.firstName,
      lastName: participant.lastName,
      response: participant.response,
      respondedAt: participant.respondedAt?.toISOString() ?? null,
      invitedAt: participant.invitedAt.toISOString(),
    })),
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
  };
}
