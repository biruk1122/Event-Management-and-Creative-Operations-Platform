import { Injectable } from "@nestjs/common";

import {
  CalendarEntryType,
  MeetingParticipantResponse,
  MeetingStatus,
  OutboxActorKind,
  Prisma,
  UserAccountStatus,
  type MeetingType,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import { OutboxWriterService } from "../../outbox/outbox-writer.service.js";
import type { MeetingParticipantInvitedEventPayload } from "../../outbox/outbox.types.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface MeetingPersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface MeetingParticipantRecord extends MeetingPersonRecord {
  response: MeetingParticipantResponse;
  respondedAt: Date | null;
  invitedAt: Date;
}

export interface MeetingRecord {
  id: string;
  workspaceId: string | null;
  title: string;
  description: string | null;
  type: MeetingType;
  status: MeetingStatus;
  organizer: MeetingPersonRecord;
  startAt: Date;
  endAt: Date;
  location: string | null;
  onlineLink: string | null;
  reminderAt: Date | null;
  participants: MeetingParticipantRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingVisibility {
  organization: boolean;
  departmentId?: string;
  selfUserId?: string;
}

export interface ListMeetingsInput {
  visibility: MeetingVisibility;
  status?: MeetingStatus;
  type?: MeetingType;
  workspaceId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  page: number;
  pageSize: number;
}

export interface CreateMeetingInput {
  title: string;
  description?: string;
  type: MeetingType;
  organizerId: string;
  workspaceId?: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  onlineLink?: string;
  reminderAt?: Date;
  participantIds: string[];
  correlationId: string;
}

export interface UpdateMeetingFields {
  title?: string;
  description?: string | null;
  type?: MeetingType;
  startAt?: Date;
  endAt?: Date;
  location?: string | null;
  onlineLink?: string | null;
  reminderAt?: Date | null;
}

const PERSON_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;

const MEETING_SELECT = {
  id: true,
  workspaceId: true,
  title: true,
  description: true,
  type: true,
  status: true,
  organizer: { select: PERSON_SELECT },
  startAt: true,
  endAt: true,
  location: true,
  onlineLink: true,
  reminderAt: true,
  participants: {
    select: {
      response: true,
      respondedAt: true,
      createdAt: true,
      user: { select: PERSON_SELECT },
    },
  },
  createdAt: true,
  updatedAt: true,
} as const;

type RawMeeting = Prisma.MeetingGetPayload<{ select: typeof MEETING_SELECT }>;

function byPerson(a: MeetingPersonRecord, b: MeetingPersonRecord): number {
  return (
    (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
    (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
    a.email.localeCompare(b.email)
  );
}

function toRecord(raw: RawMeeting): MeetingRecord {
  return {
    ...raw,
    participants: raw.participants
      .map(({ user, response, respondedAt, createdAt }) => ({
        ...user,
        response,
        respondedAt,
        invitedAt: createdAt,
      }))
      .sort(byPerson),
  };
}

function visibleWhere(visibility: MeetingVisibility): Prisma.MeetingWhereInput {
  if (visibility.organization) return {};
  const alternatives: Prisma.MeetingWhereInput[] = [];
  if (visibility.departmentId) {
    alternatives.push(
      { organizer: { departmentId: visibility.departmentId } },
      {
        participants: {
          some: { user: { departmentId: visibility.departmentId } },
        },
      },
    );
  }
  if (visibility.selfUserId) {
    alternatives.push(
      { organizerId: visibility.selfUserId },
      { participants: { some: { userId: visibility.selfUserId } } },
    );
  }
  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

function updateData(fields: UpdateMeetingFields): Prisma.MeetingUpdateInput {
  const data: Prisma.MeetingUpdateInput = {};
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.type !== undefined) data.type = fields.type;
  if (fields.startAt !== undefined) data.startAt = fields.startAt;
  if (fields.endAt !== undefined) data.endAt = fields.endAt;
  if (fields.location !== undefined) data.location = fields.location;
  if (fields.onlineLink !== undefined) data.onlineLink = fields.onlineLink;
  if (fields.reminderAt !== undefined) data.reminderAt = fields.reminderAt;
  return data;
}

async function lockMeeting(
  tx: Prisma.TransactionClient,
  meetingId: string,
): Promise<boolean> {
  if (!isUuid(meetingId)) return false;
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM meetings WHERE id = ${meetingId}::uuid FOR UPDATE`,
  );
  return rows.length === 1;
}

@Injectable()
export class MeetingsRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async workspaceExists(id: string): Promise<boolean> {
    return (
      isUuid(id) && (await this.db.workspace.count({ where: { id } })) === 1
    );
  }

  async workspaceAccessibleToUser(
    id: string,
    userId: string,
  ): Promise<boolean> {
    if (!isUuid(id)) return false;
    return (
      (await this.db.workspace.count({
        where: {
          id,
          OR: [
            { managerId: userId },
            { participants: { some: { userId } } },
            { teams: { some: { team: { members: { some: { userId } } } } } },
          ],
        },
      })) === 1
    );
  }

  async activeUsersExist(userIds: string[]): Promise<boolean> {
    if (userIds.length === 0) return true;
    const count = await this.db.user.count({
      where: { id: { in: userIds }, status: UserAccountStatus.ACTIVE },
    });
    return count === new Set(userIds).size;
  }

  async activeUsersBelongToDepartment(
    userIds: string[],
    departmentId: string,
  ): Promise<boolean> {
    if (userIds.length === 0) return true;
    const count = await this.db.user.count({
      where: {
        id: { in: userIds },
        departmentId,
        status: UserAccountStatus.ACTIVE,
      },
    });
    return count === new Set(userIds).size;
  }

  async list(
    input: ListMeetingsInput,
  ): Promise<{ items: MeetingRecord[]; total: number }> {
    const where: Prisma.MeetingWhereInput = {
      AND: [
        visibleWhere(input.visibility),
        ...(input.from ? [{ endAt: { gt: input.from } }] : []),
        ...(input.to ? [{ startAt: { lt: input.to } }] : []),
      ],
      ...(input.status ? { status: input.status } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { description: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.meeting.findMany({
        where,
        select: MEETING_SELECT,
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.meeting.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  async findById(id: string): Promise<MeetingRecord | null> {
    if (!isUuid(id)) return null;
    const meeting = await this.db.meeting.findUnique({
      where: { id },
      select: MEETING_SELECT,
    });
    return meeting ? toRecord(meeting) : null;
  }

  async findVisibleById(
    id: string,
    visibility: MeetingVisibility,
  ): Promise<MeetingRecord | null> {
    if (!isUuid(id)) return null;
    const meeting = await this.db.meeting.findFirst({
      where: { AND: [{ id }, visibleWhere(visibility)] },
      select: MEETING_SELECT,
    });
    return meeting ? toRecord(meeting) : null;
  }

  async create(input: CreateMeetingInput): Promise<MeetingRecord> {
    return this.db.$transaction(async (tx) => {
      const meeting = await tx.meeting.create({
        data: {
          title: input.title,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          type: input.type,
          organizerId: input.organizerId,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          startAt: input.startAt,
          endAt: input.endAt,
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.onlineLink !== undefined
            ? { onlineLink: input.onlineLink }
            : {}),
          ...(input.reminderAt !== undefined
            ? { reminderAt: input.reminderAt }
            : {}),
          participants: {
            create: input.participantIds.map((userId) => ({ userId })),
          },
        },
        select: { id: true },
      });
      await tx.calendarEntry.createMany({
        data: [input.organizerId, ...input.participantIds].map((userId) => ({
          userId,
          meetingId: meeting.id,
          createdById: input.organizerId,
          type: CalendarEntryType.MEETING,
          title: input.title,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          startAt: input.startAt,
          endAt: input.endAt,
        })),
        skipDuplicates: true,
      });
      for (const participantUserId of input.participantIds) {
        await this.appendInvitation(
          tx,
          meeting.id,
          input.organizerId,
          participantUserId,
          input.workspaceId,
          input.correlationId,
        );
      }
      const created = await tx.meeting.findUniqueOrThrow({
        where: { id: meeting.id },
        select: MEETING_SELECT,
      });
      return toRecord(created);
    });
  }

  async update(
    id: string,
    organizerId: string,
    fields: UpdateMeetingFields,
  ): Promise<MeetingRecord | "not_found" | "forbidden" | "not_scheduled"> {
    return this.db.$transaction(async (tx) => {
      if (!(await lockMeeting(tx, id))) return "not_found";
      const current = await tx.meeting.findUnique({
        where: { id },
        select: { organizerId: true, status: true },
      });
      if (!current) return "not_found";
      if (current.organizerId !== organizerId) return "forbidden";
      if (current.status !== MeetingStatus.SCHEDULED) return "not_scheduled";
      const updated = await tx.meeting.update({
        where: { id },
        data: updateData(fields),
        select: MEETING_SELECT,
      });
      await tx.calendarEntry.updateMany({
        where: { meetingId: id },
        data: {
          ...(fields.title !== undefined ? { title: fields.title } : {}),
          ...(fields.description !== undefined
            ? { description: fields.description }
            : {}),
          ...(fields.startAt !== undefined ? { startAt: fields.startAt } : {}),
          ...(fields.endAt !== undefined ? { endAt: fields.endAt } : {}),
        },
      });
      if (status === MeetingStatus.CANCELLED) {
        await tx.calendarEntry.deleteMany({ where: { meetingId: id } });
      }
      return toRecord(updated);
    });
  }

  async addParticipant(
    id: string,
    organizerId: string,
    userId: string,
    correlationId: string,
  ): Promise<
    | MeetingRecord
    | "not_found"
    | "forbidden"
    | "not_scheduled"
    | "user_not_found"
    | "already_invited"
  > {
    if (!isUuid(userId)) return "user_not_found";
    return this.db.$transaction(async (tx) => {
      if (!(await lockMeeting(tx, id))) return "not_found";
      const current = await tx.meeting.findUnique({
        where: { id },
        select: {
          organizerId: true,
          status: true,
          workspaceId: true,
          title: true,
          description: true,
          startAt: true,
          endAt: true,
        },
      });
      if (!current) return "not_found";
      if (current.organizerId !== organizerId) return "forbidden";
      if (current.status !== MeetingStatus.SCHEDULED) return "not_scheduled";
      const user = await tx.user.findFirst({
        where: { id: userId, status: UserAccountStatus.ACTIVE },
        select: { id: true },
      });
      if (!user) return "user_not_found";
      const existing = await tx.meetingParticipant.count({
        where: { meetingId: id, userId },
      });
      if (existing) return "already_invited";
      await tx.meetingParticipant.create({ data: { meetingId: id, userId } });
      await tx.calendarEntry.create({
        data: {
          userId,
          meetingId: id,
          createdById: organizerId,
          type: CalendarEntryType.MEETING,
          title: current.title,
          description: current.description,
          startAt: current.startAt,
          endAt: current.endAt,
        },
      });
      await this.appendInvitation(
        tx,
        id,
        organizerId,
        userId,
        current.workspaceId,
        correlationId,
      );
      const updated = await tx.meeting.findUniqueOrThrow({
        where: { id },
        select: MEETING_SELECT,
      });
      return toRecord(updated);
    });
  }

  async removeParticipant(
    id: string,
    organizerId: string,
    userId: string,
  ): Promise<
    MeetingRecord | "not_found" | "forbidden" | "not_scheduled" | "not_invited"
  > {
    if (!isUuid(userId)) return "not_invited";
    return this.db.$transaction(async (tx) => {
      if (!(await lockMeeting(tx, id))) return "not_found";
      const current = await tx.meeting.findUnique({
        where: { id },
        select: { organizerId: true, status: true },
      });
      if (!current) return "not_found";
      if (current.organizerId !== organizerId) return "forbidden";
      if (current.status !== MeetingStatus.SCHEDULED) return "not_scheduled";
      const removed = await tx.meetingParticipant.deleteMany({
        where: { meetingId: id, userId },
      });
      if (!removed.count) return "not_invited";
      await tx.calendarEntry.deleteMany({ where: { meetingId: id, userId } });
      const updated = await tx.meeting.findUniqueOrThrow({
        where: { id },
        select: MEETING_SELECT,
      });
      return toRecord(updated);
    });
  }

  async respond(
    id: string,
    userId: string,
    response: "ACCEPTED" | "DECLINED",
  ): Promise<
    | { response: MeetingParticipantResponse; respondedAt: Date }
    | "not_found"
    | "not_scheduled"
    | "not_invited"
    | "already_acknowledged"
  > {
    return this.db.$transaction(async (tx) => {
      if (!(await lockMeeting(tx, id))) return "not_found";
      const meeting = await tx.meeting.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!meeting) return "not_found";
      if (meeting.status !== MeetingStatus.SCHEDULED) return "not_scheduled";
      const participant = await tx.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId: id, userId } },
        select: { response: true, respondedAt: true },
      });
      if (!participant) return "not_invited";
      if (participant.response !== MeetingParticipantResponse.PENDING) {
        if (participant.response === response && participant.respondedAt) {
          return {
            response: participant.response,
            respondedAt: participant.respondedAt,
          };
        }
        return "already_acknowledged";
      }
      const respondedAt = new Date();
      const updated = await tx.meetingParticipant.update({
        where: { meetingId_userId: { meetingId: id, userId } },
        data: { response, respondedAt },
        select: { response: true, respondedAt: true },
      });
      return { response: updated.response, respondedAt: updated.respondedAt! };
    });
  }

  async transition(
    id: string,
    organizerId: string,
    status: "COMPLETED" | "CANCELLED",
  ): Promise<MeetingRecord | "not_found" | "forbidden" | "invalid_transition"> {
    return this.db.$transaction(async (tx) => {
      if (!(await lockMeeting(tx, id))) return "not_found";
      const current = await tx.meeting.findUnique({
        where: { id },
        select: { organizerId: true, status: true },
      });
      if (!current) return "not_found";
      if (current.organizerId !== organizerId) return "forbidden";
      if (current.status !== MeetingStatus.SCHEDULED)
        return "invalid_transition";
      const updated = await tx.meeting.update({
        where: { id },
        data: { status },
        select: MEETING_SELECT,
      });
      return toRecord(updated);
    });
  }

  async availability(
    userIds: string[],
    startAt: Date,
    endAt: Date,
    excludeMeetingId?: string,
  ): Promise<Map<string, number>> {
    const meetings = await this.db.meeting.findMany({
      where: {
        status: MeetingStatus.SCHEDULED,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}),
        OR: [
          { organizerId: { in: userIds } },
          {
            participants: {
              some: {
                userId: { in: userIds },
                response: { not: MeetingParticipantResponse.DECLINED },
              },
            },
          },
        ],
      },
      select: {
        organizerId: true,
        participants: {
          where: {
            userId: { in: userIds },
            response: { not: MeetingParticipantResponse.DECLINED },
          },
          select: { userId: true },
        },
      },
    });
    const counts = new Map(userIds.map((id) => [id, 0]));
    for (const meeting of meetings) {
      const affected = new Set([
        meeting.organizerId,
        ...meeting.participants.map((participant) => participant.userId),
      ]);
      for (const userId of affected) {
        if (counts.has(userId))
          counts.set(userId, (counts.get(userId) ?? 0) + 1);
      }
    }
    return counts;
  }

  private appendInvitation(
    tx: Prisma.TransactionClient,
    meetingId: string,
    organizerId: string,
    participantUserId: string,
    workspaceId: string | undefined | null,
    correlationId: string,
  ): Promise<void> {
    return this.outbox.append(tx, {
      name: "meeting.participant.invited",
      version: 1,
      actorKind: OutboxActorKind.USER,
      actorUserId: organizerId,
      correlationId,
      resourceType: "meeting",
      resourceId: meetingId,
      ...(workspaceId ? { workspaceContext: workspaceId } : {}),
      payload: {
        participantUserId,
      } satisfies MeetingParticipantInvitedEventPayload,
      consumers: [{ consumerName: "notifications", consumerVersion: 1 }],
    });
  }
}
