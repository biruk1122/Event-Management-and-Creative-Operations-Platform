import { Injectable } from "@nestjs/common";

import { ProductionsService } from "../productions/productions.service.js";
import type { CreateProductionLocationDto } from "./dto/create-production-location.dto.js";
import type { UpdateProductionLocationDto } from "./dto/update-production-location.dto.js";
import { productionLocationNotFound } from "./production-locations.errors.js";
import {
  ProductionLocationsRepository,
  type ProductionLocationRecord,
} from "./infrastructure/production-locations.repository.js";
import type { ProductionLocationResponse } from "./production-locations.contracts.js";

function toResponse(
  record: ProductionLocationRecord,
): ProductionLocationResponse {
  return {
    id: record.id,
    productionId: record.productionId,
    name: record.name,
    address: record.address,
    description: record.description,
    contactName: record.contactName,
    contactEmail: record.contactEmail,
    contactPhone: record.contactPhone,
    status: record.status,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * A production location is a sub-resource of its production: this service
 * never resolves its own department scope, it reuses the parent production's
 * existing authorization - `project.read` to view, `project.update` to
 * manage - exactly the same "sub-resource reuses the parent's own grants"
 * shape `TaskFileManagementController` already established for attachments.
 */
@Injectable()
export class ProductionLocationsService {
  constructor(
    private readonly repository: ProductionLocationsRepository,
    private readonly productions: ProductionsService,
  ) {}

  async list(
    userId: string,
    productionId: string,
  ): Promise<ProductionLocationResponse[]> {
    await this.productions.authorize(userId, productionId, "project.read");
    return (await this.repository.list(productionId)).map(toResponse);
  }

  async get(
    userId: string,
    productionId: string,
    id: string,
  ): Promise<ProductionLocationResponse> {
    await this.productions.authorize(userId, productionId, "project.read");
    const item = await this.repository.findById(productionId, id);
    if (!item) throw productionLocationNotFound();
    return toResponse(item);
  }

  async create(
    userId: string,
    productionId: string,
    dto: CreateProductionLocationDto,
  ): Promise<ProductionLocationResponse> {
    await this.productions.authorize(userId, productionId, "project.update");
    const result = await this.repository.create({
      productionId,
      name: dto.name.trim(),
      createdById: userId,
      ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(dto.contactName !== undefined
        ? { contactName: dto.contactName.trim() }
        : {}),
      ...(dto.contactEmail !== undefined
        ? { contactEmail: dto.contactEmail.trim() }
        : {}),
      ...(dto.contactPhone !== undefined
        ? { contactPhone: dto.contactPhone.trim() }
        : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
    });
    return toResponse(result);
  }

  async update(
    userId: string,
    productionId: string,
    id: string,
    dto: UpdateProductionLocationDto,
  ): Promise<ProductionLocationResponse> {
    await this.productions.authorize(userId, productionId, "project.update");
    const result = await this.repository.update(productionId, id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.address !== undefined
        ? { address: dto.address === null ? null : dto.address.trim() }
        : {}),
      ...(dto.description !== undefined
        ? {
            description:
              dto.description === null ? null : dto.description.trim(),
          }
        : {}),
      ...(dto.contactName !== undefined
        ? {
            contactName:
              dto.contactName === null ? null : dto.contactName.trim(),
          }
        : {}),
      ...(dto.contactEmail !== undefined
        ? {
            contactEmail:
              dto.contactEmail === null ? null : dto.contactEmail.trim(),
          }
        : {}),
      ...(dto.contactPhone !== undefined
        ? {
            contactPhone:
              dto.contactPhone === null ? null : dto.contactPhone.trim(),
          }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.notes !== undefined
        ? { notes: dto.notes === null ? null : dto.notes.trim() }
        : {}),
    });
    if (!result) throw productionLocationNotFound();
    return toResponse(result);
  }

  async remove(
    userId: string,
    productionId: string,
    id: string,
  ): Promise<void> {
    await this.productions.authorize(userId, productionId, "project.update");
    if (!(await this.repository.delete(productionId, id)))
      throw productionLocationNotFound();
  }
}
