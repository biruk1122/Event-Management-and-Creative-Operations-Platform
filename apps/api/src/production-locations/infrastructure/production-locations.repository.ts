import { Injectable } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT = {
  id: true,
  productionId: true,
  name: true,
  address: true,
  description: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ProductionLocationRecord = Prisma.ProductionLocationGetPayload<{
  select: typeof SELECT;
}>;

export interface CreateProductionLocationInput {
  productionId: string;
  name: string;
  address?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  status?: Prisma.ProductionLocationUncheckedCreateInput["status"];
  notes?: string;
  createdById: string;
}

export interface UpdateProductionLocationFields {
  name?: string;
  address?: string | null;
  description?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status?: Prisma.ProductionLocationUncheckedUpdateInput["status"];
  notes?: string | null;
}

function isUuid(value: string): boolean {
  return UUID.test(value);
}

@Injectable()
export class ProductionLocationsRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(productionId: string): Promise<ProductionLocationRecord[]> {
    if (!isUuid(productionId)) return [];
    return this.db.productionLocation.findMany({
      where: { productionId },
      select: SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async findById(
    productionId: string,
    id: string,
  ): Promise<ProductionLocationRecord | null> {
    if (!isUuid(productionId) || !isUuid(id)) return null;
    return this.db.productionLocation.findFirst({
      where: { id, productionId },
      select: SELECT,
    });
  }

  async create(
    input: CreateProductionLocationInput,
  ): Promise<ProductionLocationRecord> {
    return this.db.productionLocation.create({
      data: {
        productionId: input.productionId,
        name: input.name,
        createdById: input.createdById,
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.contactName !== undefined
          ? { contactName: input.contactName }
          : {}),
        ...(input.contactEmail !== undefined
          ? { contactEmail: input.contactEmail }
          : {}),
        ...(input.contactPhone !== undefined
          ? { contactPhone: input.contactPhone }
          : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      select: SELECT,
    });
  }

  async update(
    productionId: string,
    id: string,
    fields: UpdateProductionLocationFields,
  ): Promise<ProductionLocationRecord | null> {
    if (!isUuid(productionId) || !isUuid(id)) return null;
    const data: Prisma.ProductionLocationUncheckedUpdateInput = {};
    if (fields.name !== undefined) data.name = fields.name;
    if (fields.address !== undefined) data.address = fields.address;
    if (fields.description !== undefined)
      data.description = fields.description;
    if (fields.contactName !== undefined)
      data.contactName = fields.contactName;
    if (fields.contactEmail !== undefined)
      data.contactEmail = fields.contactEmail;
    if (fields.contactPhone !== undefined)
      data.contactPhone = fields.contactPhone;
    if (fields.status !== undefined) data.status = fields.status;
    if (fields.notes !== undefined) data.notes = fields.notes;
    const changed = await this.db.productionLocation.updateMany({
      where: { id, productionId },
      data,
    });
    if (changed.count !== 1) return null;
    return this.findById(productionId, id);
  }

  async delete(productionId: string, id: string): Promise<boolean> {
    if (!isUuid(productionId) || !isUuid(id)) return false;
    const result = await this.db.productionLocation.deleteMany({
      where: { id, productionId },
    });
    return result.count === 1;
  }
}
