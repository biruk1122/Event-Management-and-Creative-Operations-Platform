import { Injectable } from "@nestjs/common";

import {
  Prisma,
  TalentAssignmentStatus,
  TalentAvailability,
  TalentType,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const person = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
} as const;
const select = {
  id: true,
  fullName: true,
  type: true,
  profileImageId: true,
  email: true,
  phone: true,
  biography: true,
  availability: true,
  createdAt: true,
  updatedAt: true,
  manager: { select: person },
  socialLinks: {
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, url: true },
  },
  schedules: {
    orderBy: [
      { startAt: "asc" as const },
      { id: "asc" as const },
    ] as Prisma.TalentScheduleOrderByWithRelationInput[],
    select: { id: true, title: true, startAt: true, endAt: true },
  },
  eventAssignments: {
    orderBy: [
      { assignedAt: "desc" as const },
      { id: "desc" as const },
    ] as Prisma.EventTalentOrderByWithRelationInput[],
    select: {
      id: true,
      role: true,
      status: true,
      assignedAt: true,
      updatedAt: true,
      event: { select: { id: true, name: true } },
    },
  },
} as const;

export type TalentRecord = Prisma.TalentGetPayload<{ select: typeof select }>;
export type TalentFields = {
  fullName?: string;
  type?: TalentType;
  email?: string | null;
  phone?: string | null;
  biography?: string | null;
};

@Injectable()
export class TalentRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<TalentRecord | null> {
    return UUID.test(id)
      ? this.db.talent.findUnique({ where: { id }, select })
      : null;
  }
  async list(input: {
    page: number;
    pageSize: number;
    search?: string;
    type?: TalentType;
    availability?: TalentAvailability;
    managerId?: string;
  }) {
    const where: Prisma.TalentWhereInput = {
      ...(input.type ? { type: input.type } : {}),
      ...(input.availability ? { availability: input.availability } : {}),
      ...(input.managerId ? { managerId: input.managerId } : {}),
      ...(input.search
        ? { fullName: { contains: input.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.talent.findMany({
        where,
        select,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.talent.count({ where }),
    ]);
    return { items, total };
  }
  async create(input: {
    fullName: string;
    type: TalentType;
    email?: string;
    phone?: string;
    biography?: string;
    managerId?: string;
  }): Promise<TalentRecord | "manager_not_found"> {
    try {
      return await this.db.talent.create({ data: input, select });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      )
        return "manager_not_found";
      throw error;
    }
  }
  async update(id: string, fields: TalentFields): Promise<TalentRecord | null> {
    if (!UUID.test(id)) return null;
    try {
      return await this.db.talent.update({
        where: { id },
        data: fields,
        select,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      )
        return null;
      throw error;
    }
  }
  async setManager(
    id: string,
    managerId: string | null,
  ): Promise<TalentRecord | "manager_not_found" | null> {
    if (!UUID.test(id)) return null;
    try {
      return await this.db.talent.update({
        where: { id },
        data: { managerId },
        select,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      )
        return "manager_not_found";
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      )
        return null;
      throw error;
    }
  }
  async setAvailability(
    id: string,
    availability: TalentAvailability,
  ): Promise<TalentRecord | null> {
    if (!UUID.test(id)) return null;
    try {
      return await this.db.talent.update({
        where: { id },
        data: { availability },
        select,
      });
    } catch {
      return null;
    }
  }
  async createSocialLink(
    id: string,
    label: string,
    url: string,
  ): Promise<TalentRecord | "conflict" | null> {
    if (!UUID.test(id)) return null;
    try {
      await this.db.talentSocialLink.create({
        data: { talentId: id, label, url },
      });
      return this.findById(id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return "conflict";
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      )
        return null;
      throw error;
    }
  }
  async deleteSocialLink(talentId: string, id: string): Promise<boolean> {
    if (!UUID.test(talentId) || !UUID.test(id)) return false;
    return (
      (await this.db.talentSocialLink.deleteMany({ where: { id, talentId } }))
        .count === 1
    );
  }
  async createSchedule(
    talentId: string,
    title: string,
    startAt: Date,
    endAt: Date,
  ): Promise<TalentRecord | null> {
    if (!UUID.test(talentId)) return null;
    await this.db.talentSchedule.create({
      data: { talentId, title, startAt, endAt },
    });
    return this.findById(talentId);
  }
  async updateSchedule(
    talentId: string,
    id: string,
    input: { title?: string; startAt?: Date; endAt?: Date },
  ): Promise<TalentRecord | null> {
    if (!UUID.test(talentId) || !UUID.test(id)) return null;
    const result = await this.db.talentSchedule.updateMany({
      where: { id, talentId },
      data: input,
    });
    return result.count ? this.findById(talentId) : null;
  }
  async deleteSchedule(talentId: string, id: string): Promise<boolean> {
    return (
      UUID.test(talentId) &&
      UUID.test(id) &&
      (await this.db.talentSchedule.deleteMany({ where: { id, talentId } }))
        .count === 1
    );
  }
  async createEventAssignment(
    talentId: string,
    eventId: string,
    role: string,
  ): Promise<TalentRecord | "conflict" | "event_not_found" | null> {
    if (!UUID.test(talentId) || !UUID.test(eventId)) return null;
    try {
      await this.db.eventTalent.create({ data: { talentId, eventId, role } });
      return this.findById(talentId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return "conflict";
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      )
        return "event_not_found";
      throw error;
    }
  }
  async assignmentStatus(
    talentId: string,
    id: string,
  ): Promise<TalentAssignmentStatus | null> {
    if (!UUID.test(talentId) || !UUID.test(id)) return null;
    const item = await this.db.eventTalent.findFirst({
      where: { id, talentId },
      select: { status: true },
    });
    return item?.status ?? null;
  }
  async transitionAssignment(
    talentId: string,
    id: string,
    status: TalentAssignmentStatus,
  ): Promise<TalentRecord | null> {
    if (!UUID.test(talentId) || !UUID.test(id)) return null;
    const result = await this.db.eventTalent.updateMany({
      where: { id, talentId },
      data: { status },
    });
    return result.count ? this.findById(talentId) : null;
  }
}
