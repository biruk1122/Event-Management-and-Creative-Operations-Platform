import { Injectable } from "@nestjs/common";

import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import type { CreateSupplierDto } from "./dto/create-supplier.dto.js";
import type { ListSuppliersQueryDto } from "./dto/list-suppliers-query.dto.js";
import type { UpdateSupplierDto } from "./dto/update-supplier.dto.js";
import type {
  PaginatedSuppliersResponse,
  SupplierResponse,
} from "./suppliers.contracts.js";
import { supplierNotFound } from "./suppliers.errors.js";
import {
  SuppliersRepository,
  type SupplierRecord,
  type SupplierVisibility,
} from "./infrastructure/suppliers.repository.js";

function toResponse(supplier: SupplierRecord): SupplierResponse {
  return {
    id: supplier.id,
    name: supplier.name,
    category: supplier.category,
    contactName: supplier.contactName,
    contactEmail: supplier.contactEmail,
    contactPhone: supplier.contactPhone,
    departmentId: supplier.departmentId,
    status: supplier.status,
    notes: supplier.notes,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly repo: SuppliersRepository,
    private readonly permissions: PermissionsService,
  ) {}

  private async visibility(
    userId: string,
    key: string,
  ): Promise<SupplierVisibility> {
    const grants = await this.permissions.getEffectiveGrants(userId);
    const organization = grants.some(
      (g) => g.permissionKey === key && g.scope === "ORGANIZATION",
    );
    const department = grants.some(
      (g) => g.permissionKey === key && g.scope === "DEPARTMENT",
    );
    if (!organization && !department) throw permissionDenied();
    const departmentId = department
      ? await this.repo.findUserDepartmentId(userId)
      : null;
    return { organization, ...(departmentId ? { departmentId } : {}) };
  }

  private authorized(
    supplier: SupplierRecord,
    visibility: SupplierVisibility,
  ): boolean {
    return (
      visibility.organization ||
      supplier.departmentId === null ||
      supplier.departmentId === visibility.departmentId
    );
  }

  private async load(
    userId: string,
    id: string,
    key: string,
  ): Promise<SupplierRecord> {
    const visibility = await this.visibility(userId, key);
    const supplier = await this.repo.findById(id);
    if (!supplier) {
      if (!visibility.organization) throw permissionDenied();
      throw supplierNotFound();
    }
    if (!this.authorized(supplier, visibility)) throw permissionDenied();
    return supplier;
  }

  async list(
    userId: string,
    query: ListSuppliersQueryDto,
  ): Promise<PaginatedSuppliersResponse> {
    const visibility = await this.visibility(userId, "supplier.read");
    const result = await this.repo.list({
      visibility,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map(toResponse),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async get(userId: string, id: string): Promise<SupplierResponse> {
    return toResponse(await this.load(userId, id, "supplier.read"));
  }

  async create(
    userId: string,
    dto: CreateSupplierDto,
  ): Promise<SupplierResponse> {
    const visibility = await this.visibility(userId, "supplier.create");
    // A department-scoped manager can only register a private entry for
    // their own department; only an organization-scoped caller may add to
    // the shared directory (`departmentId = null`).
    const departmentId = visibility.organization
      ? null
      : (visibility.departmentId ?? null);
    return toResponse(
      await this.repo.create(departmentId, {
        name: dto.name.trim(),
        ...(dto.category !== undefined
          ? { category: dto.category.trim() }
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
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
        createdById: userId,
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierResponse> {
    await this.load(userId, id, "supplier.update");
    const result = await this.repo.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
      ...(dto.contactName !== undefined
        ? { contactName: dto.contactName.trim() }
        : {}),
      ...(dto.contactEmail !== undefined
        ? { contactEmail: dto.contactEmail.trim() }
        : {}),
      ...(dto.contactPhone !== undefined
        ? { contactPhone: dto.contactPhone.trim() }
        : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes.trim() } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    if (result === "not_found") throw supplierNotFound();
    return toResponse(result);
  }
}
