import { Injectable } from "@nestjs/common";

import { Prisma, type SupplierStatus } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import { supplierDuplicate } from "../suppliers.errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface SupplierRecord {
  id: string;
  name: string;
  category: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  departmentId: string | null;
  status: SupplierStatus;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Every supplier is visible to an organization-scoped caller; a
 * department-scoped caller sees the shared directory (`departmentId = null`)
 * plus their own department's private entries. */
export interface SupplierVisibility {
  organization: boolean;
  departmentId?: string;
}

export interface ListSuppliersInput {
  visibility: SupplierVisibility;
  status?: SupplierStatus;
  departmentId?: string;
  page: number;
  pageSize: number;
}

export interface CreateSupplierInput {
  name: string;
  category?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  createdById: string;
}

export interface UpdateSupplierFields {
  name?: string;
  category?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  status?: SupplierStatus;
}

function visibleWhere(
  visibility: SupplierVisibility,
): Prisma.SupplierWhereInput {
  if (visibility.organization) return {};
  return {
    OR: [
      { departmentId: null },
      ...(visibility.departmentId
        ? [{ departmentId: visibility.departmentId }]
        : []),
    ],
  };
}

function updateData(fields: UpdateSupplierFields): Prisma.SupplierUpdateInput {
  const data: Prisma.SupplierUpdateInput = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.category !== undefined) data.category = fields.category;
  if (fields.contactName !== undefined) data.contactName = fields.contactName;
  if (fields.contactEmail !== undefined)
    data.contactEmail = fields.contactEmail;
  if (fields.contactPhone !== undefined)
    data.contactPhone = fields.contactPhone;
  if (fields.notes !== undefined) data.notes = fields.notes;
  if (fields.status !== undefined) data.status = fields.status;
  return data;
}

@Injectable()
export class SuppliersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findUserDepartmentId(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  async findById(id: string): Promise<SupplierRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.supplier.findUnique({ where: { id } });
  }

  async findVisibleById(
    id: string,
    visibility: SupplierVisibility,
  ): Promise<SupplierRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.supplier.findFirst({
      where: { AND: [{ id }, visibleWhere(visibility)] },
    });
  }

  async list(
    input: ListSuppliersInput,
  ): Promise<{ items: SupplierRecord[]; total: number }> {
    const where: Prisma.SupplierWhereInput = {
      ...visibleWhere(input.visibility),
      ...(input.status ? { status: input.status } : {}),
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.supplier.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.supplier.count({ where }),
    ]);
    return { items, total };
  }

  async create(
    departmentId: string | null,
    data: CreateSupplierInput,
  ): Promise<SupplierRecord> {
    try {
      return await this.db.supplier.create({
        data: {
          name: data.name,
          departmentId,
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.contactName !== undefined
            ? { contactName: data.contactName }
            : {}),
          ...(data.contactEmail !== undefined
            ? { contactEmail: data.contactEmail }
            : {}),
          ...(data.contactPhone !== undefined
            ? { contactPhone: data.contactPhone }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          createdById: data.createdById,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw supplierDuplicate();
      throw error;
    }
  }

  async update(
    id: string,
    fields: UpdateSupplierFields,
  ): Promise<SupplierRecord | "not_found"> {
    if (!isUuid(id)) return "not_found";
    try {
      return await this.db.supplier.update({
        where: { id },
        data: updateData(fields),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      )
        return "not_found";
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw supplierDuplicate();
      throw error;
    }
  }
}
