import { Injectable } from "@nestjs/common";

import {
  Prisma,
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

/** Talent with at least one assignment still active. */
const ASSIGNED_WHERE: Prisma.TalentWhereInput = {
  OR: [
    { eventAssignments: { some: { status: "ASSIGNED" } } },
    { productionAssignments: { some: { status: "ASSIGNED" } } },
    { promotionAssignments: { some: { status: "ASSIGNED" } } },
  ],
};

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
    assignment?: "assigned" | "unassigned";
    sort?: "name" | "newest" | "availability";
  }) {
    const assigned: Prisma.TalentWhereInput = {
      OR: [
        { eventAssignments: { some: { status: "ASSIGNED" } } },
        { productionAssignments: { some: { status: "ASSIGNED" } } },
        { promotionAssignments: { some: { status: "ASSIGNED" } } },
      ],
    };
    const where: Prisma.TalentWhereInput = {
      ...(input.type ? { type: input.type } : {}),
      ...(input.availability ? { availability: input.availability } : {}),
      ...(input.managerId ? { managerId: input.managerId } : {}),
      ...(input.search
        ? { fullName: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(input.assignment === "assigned" ? assigned : {}),
      ...(input.assignment === "unassigned" ? { NOT: assigned } : {}),
    };
    const orderBy: Prisma.TalentOrderByWithRelationInput[] =
      input.sort === "newest"
        ? [{ createdAt: "desc" }, { id: "asc" }]
        : input.sort === "availability"
          ? [{ availability: "asc" }, { fullName: "asc" }, { id: "asc" }]
          : input.sort === "name"
            ? [{ fullName: "asc" }, { id: "asc" }]
            : [{ createdAt: "asc" }, { id: "asc" }];
    const [items, total] = await Promise.all([
      this.db.talent.findMany({
        where,
        select,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.talent.count({ where }),
    ]);
    return { items, total };
  }
  /** Directory counts for the summary tiles, computed from the table. */
  async summaryCounts(): Promise<{
    total: number;
    byAvailability: Array<{ availability: TalentAvailability; count: number }>;
    assignedTalents: number;
  }> {
    const [total, grouped, assignedTalents] = await Promise.all([
      this.db.talent.count(),
      this.db.talent.groupBy({
        by: ["availability"],
        _count: { _all: true },
      }),
      this.db.talent.count({ where: ASSIGNED_WHERE }),
    ]);
    return {
      total,
      byAvailability: grouped.map((row) => ({
        availability: row.availability,
        count: row._count._all,
      })),
      assignedTalents,
    };
  }

  /** The profile and its optional first social link are written in one statement. */
  async create(input: {
    fullName: string;
    type: TalentType;
    email?: string;
    phone?: string;
    biography?: string;
    managerId?: string;
    availability?: TalentAvailability;
    socialLink?: { label: string; url: string };
  }): Promise<TalentRecord | "manager_not_found"> {
    const { socialLink, ...fields } = input;
    try {
      return await this.db.talent.create({
        data: {
          ...fields,
          ...(socialLink
            ? {
                socialLinks: {
                  create: { label: socialLink.label, url: socialLink.url },
                },
              }
            : {}),
        },
        select,
      });
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
    try {
      await this.db.talentSchedule.create({
        data: { talentId, title, startAt, endAt },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      )
        return null;
      throw error;
    }
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
}
