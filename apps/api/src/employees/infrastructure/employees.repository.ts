import { Injectable } from "@nestjs/common";

import {
  EmployeeGender,
  EmploymentStatus,
  EmploymentType,
  Prisma,
} from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";
import type { EmployeeSortField } from "../dto/list-employees-query.dto.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface EmployeeRecord {
  id: string;
  userId: string;
  employeeCode: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  personalPhone: string | null;
  companyPhone: string | null;
  gender: EmployeeGender | null;
  dateOfBirth: Date | null;
  city: string | null;
  subCity: string | null;
  woreda: string | null;
  bankAccountNumber: string | null;
  departmentId: string | null;
  departmentName: string | null;
  position: string;
  employmentType: EmploymentType;
  employmentDate: Date;
  employmentStatus: EmploymentStatus;
  workLocation: string | null;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  grade: string | null;
  description: string | null;
  baseSalary: string | null;
  salaryScale: string | null;
  allowanceAmount: string | null;
  currency: string | null;
  totalCompensation: string | null;
  userStatus: "ACTIVE" | "INACTIVE";
  userRoleName: string | null;
  statusChangedAt: Date | null;
  statusChangedById: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListEmployeesInput {
  search?: string;
  departmentId?: string;
  position?: string;
  employmentType?: EmploymentType;
  employmentStatus?: EmploymentStatus;
  workLocation?: string;
  sort: EmployeeSortField;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface HrFields {
  employeeCode: string;
  position: string;
  employmentType: EmploymentType;
  employmentDate: Date;
  workLocation?: string | null;
  reportingManagerId?: string | null;
  grade?: string | null;
  description?: string | null;
  baseSalary?: number | null;
  salaryScale?: string | null;
  allowanceAmount?: number | null;
  currency?: string | null;
  gender?: EmployeeGender | null;
  dateOfBirth?: Date | null;
  city?: string | null;
  subCity?: string | null;
  woreda?: string | null;
  bankAccountNumber?: string | null;
  companyPhone?: string | null;
}

export interface NewUserFields {
  email: string;
  firstName: string;
  lastName: string;
  personalPhone?: string | null;
  passwordHash: string;
  roleId: string;
  departmentId: string;
}

export interface UpdateEmployeeFields {
  firstName?: string;
  lastName?: string;
  personalPhone?: string;
  position?: string;
  employmentType?: EmploymentType;
  employmentDate?: Date;
  workLocation?: string | null;
  reportingManagerId?: string | null;
  grade?: string | null;
  description?: string | null;
  baseSalary?: number | null;
  salaryScale?: string | null;
  allowanceAmount?: number | null;
  currency?: string | null;
  gender?: EmployeeGender | null;
  dateOfBirth?: Date | null;
  city?: string | null;
  subCity?: string | null;
  woreda?: string | null;
  bankAccountNumber?: string | null;
  companyPhone?: string | null;
}

const EMPLOYEE_SELECT = {
  id: true,
  userId: true,
  employeeCode: true,
  position: true,
  employmentType: true,
  employmentDate: true,
  employmentStatus: true,
  workLocation: true,
  reportingManagerId: true,
  grade: true,
  description: true,
  baseSalary: true,
  salaryScale: true,
  allowanceAmount: true,
  currency: true,
  gender: true,
  dateOfBirth: true,
  city: true,
  subCity: true,
  woreda: true,
  bankAccountNumber: true,
  companyPhone: true,
  statusChangedAt: true,
  statusChangedById: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      roleAssignment: { select: { role: { select: { name: true } } } },
    },
  },
  reportingManager: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const;

type RawEmployee = Prisma.EmployeeProfileGetPayload<{
  select: typeof EMPLOYEE_SELECT;
}>;

function managerName(manager: RawEmployee["reportingManager"]): string | null {
  if (!manager) return null;
  const name = [manager.firstName, manager.lastName]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name.length > 0 ? name : null;
}

function toRecord(raw: RawEmployee): EmployeeRecord {
  const total =
    raw.baseSalary === null && raw.allowanceAmount === null
      ? null
      : raw.baseSalary === null
        ? raw.allowanceAmount!.toFixed(2)
        : raw.allowanceAmount === null
          ? raw.baseSalary.toFixed(2)
          : raw.baseSalary.plus(raw.allowanceAmount).toFixed(2);

  return {
    id: raw.id,
    userId: raw.userId,
    employeeCode: raw.employeeCode,
    firstName: raw.user.firstName,
    lastName: raw.user.lastName,
    email: raw.user.email,
    personalPhone: raw.user.phone,
    companyPhone: raw.companyPhone,
    gender: raw.gender,
    dateOfBirth: raw.dateOfBirth,
    city: raw.city,
    subCity: raw.subCity,
    woreda: raw.woreda,
    bankAccountNumber: raw.bankAccountNumber,
    departmentId: raw.user.departmentId,
    departmentName: raw.user.department?.name ?? null,
    position: raw.position,
    employmentType: raw.employmentType,
    employmentDate: raw.employmentDate,
    employmentStatus: raw.employmentStatus,
    workLocation: raw.workLocation,
    reportingManagerId: raw.reportingManagerId,
    reportingManagerName: managerName(raw.reportingManager),
    grade: raw.grade,
    description: raw.description,
    baseSalary: raw.baseSalary === null ? null : raw.baseSalary.toFixed(2),
    salaryScale: raw.salaryScale,
    allowanceAmount:
      raw.allowanceAmount === null ? null : raw.allowanceAmount.toFixed(2),
    currency: raw.currency,
    totalCompensation: total,
    userStatus: raw.user.status,
    userRoleName: raw.user.roleAssignment?.role.name ?? null,
    statusChangedAt: raw.statusChangedAt,
    statusChangedById: raw.statusChangedById,
    createdById: raw.createdById,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function hrData(
  fields: HrFields,
): Omit<Prisma.EmployeeProfileUncheckedCreateInput, "userId" | "createdById"> {
  return {
    employeeCode: fields.employeeCode,
    position: fields.position,
    employmentType: fields.employmentType,
    employmentDate: fields.employmentDate,
    workLocation: fields.workLocation ?? null,
    reportingManagerId: fields.reportingManagerId ?? null,
    grade: fields.grade ?? null,
    description: fields.description ?? null,
    baseSalary: fields.baseSalary ?? null,
    salaryScale: fields.salaryScale ?? null,
    allowanceAmount: fields.allowanceAmount ?? null,
    currency: fields.currency ?? null,
    gender: fields.gender ?? null,
    dateOfBirth: fields.dateOfBirth ?? null,
    city: fields.city ?? null,
    subCity: fields.subCity ?? null,
    woreda: fields.woreda ?? null,
    bankAccountNumber: fields.bankAccountNumber ?? null,
    companyPhone: fields.companyPhone ?? null,
  };
}

function orderBy(
  sort: EmployeeSortField,
  direction: "asc" | "desc",
): Prisma.EmployeeProfileOrderByWithRelationInput[] {
  switch (sort) {
    case "employeeCode":
      return [{ employeeCode: direction }];
    case "employmentDate":
      return [{ employmentDate: direction }];
    case "status":
      return [{ employmentStatus: direction }, { employeeCode: "asc" }];
    case "department":
      return [
        { user: { department: { name: direction } } },
        { employeeCode: "asc" },
      ];
    case "name":
    default:
      return [
        { user: { lastName: direction } },
        { user: { firstName: direction } },
        { employeeCode: "asc" },
      ];
  }
}

@Injectable()
export class EmployeesRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<EmployeeRecord | null> {
    if (!isUuid(id)) return null;
    const raw = await this.db.employeeProfile.findUnique({
      where: { id },
      select: EMPLOYEE_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async findByUserId(userId: string): Promise<EmployeeRecord | null> {
    if (!isUuid(userId)) return null;
    const raw = await this.db.employeeProfile.findUnique({
      where: { userId },
      select: EMPLOYEE_SELECT,
    });
    return raw ? toRecord(raw) : null;
  }

  async userExists(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    return user !== null;
  }

  /**
   * Candidates for linking an existing account to a new employee profile:
   * users not already linked to one, matching by email or name. Scoped to
   * the Employees module itself so an HR Manager (who holds no `user.read`
   * grant) can still find a user to link, without widening their access to
   * the general Users directory.
   */
  async findLinkableUsers(search: string): Promise<
    {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }[]
  > {
    const users = await this.db.user.findMany({
      where: {
        employeeProfile: null,
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 10,
    });
    return users;
  }

  async list(
    input: ListEmployeesInput,
  ): Promise<{ items: EmployeeRecord[]; total: number }> {
    const where: Prisma.EmployeeProfileWhereInput = {
      ...(input.departmentId
        ? { user: { departmentId: input.departmentId } }
        : {}),
      ...(input.position
        ? { position: { contains: input.position, mode: "insensitive" } }
        : {}),
      ...(input.employmentType ? { employmentType: input.employmentType } : {}),
      ...(input.employmentStatus
        ? { employmentStatus: input.employmentStatus }
        : {}),
      ...(input.workLocation
        ? {
            workLocation: { contains: input.workLocation, mode: "insensitive" },
          }
        : {}),
      ...(input.search
        ? {
            OR: [
              { employeeCode: { contains: input.search, mode: "insensitive" } },
              {
                user: {
                  email: { contains: input.search, mode: "insensitive" },
                },
              },
              {
                user: {
                  firstName: { contains: input.search, mode: "insensitive" },
                },
              },
              {
                user: {
                  lastName: { contains: input.search, mode: "insensitive" },
                },
              },
              {
                user: {
                  phone: { contains: input.search, mode: "insensitive" },
                },
              },
              {
                companyPhone: { contains: input.search, mode: "insensitive" },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.db.$transaction([
      this.db.employeeProfile.findMany({
        where,
        select: EMPLOYEE_SELECT,
        orderBy: orderBy(input.sort, input.direction),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.employeeProfile.count({ where }),
    ]);
    return { items: items.map(toRecord), total };
  }

  /** Links an existing user to a new employee profile. */
  async createForExistingUser(
    userId: string,
    createdById: string,
    fields: HrFields,
  ): Promise<
    | EmployeeRecord
    | "user_not_found"
    | "code_conflict"
    | "already_linked"
    | "invalid_reference"
  > {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return "user_not_found";

    try {
      const created = await this.db.employeeProfile.create({
        data: { userId, createdById, ...hrData(fields) },
        select: EMPLOYEE_SELECT,
      });
      return toRecord(created);
    } catch (error) {
      if (
        isUniqueViolation(
          error,
          "employee_profiles_user_id_key",
          "userId",
          "user_id",
        )
      ) {
        return "already_linked";
      }
      if (
        isUniqueViolation(
          error,
          "employee_profiles_employee_code_key",
          "employeeCode",
          "employee_code",
        )
      ) {
        return "code_conflict";
      }
      if (isPrismaKnownError(error, "P2003")) return "invalid_reference";
      throw error;
    }
  }

  /** Creates a new user account and its employee profile in one write. */
  async createForNewUser(
    createdById: string,
    user: NewUserFields,
    fields: HrFields,
  ): Promise<
    EmployeeRecord | "email_conflict" | "code_conflict" | "invalid_reference"
  > {
    try {
      const created = await this.db.user.create({
        data: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.personalPhone ?? null,
          departmentId: user.departmentId,
          credential: {
            create: {
              passwordHash: user.passwordHash,
              mustChangePassword: true,
            },
          },
          roleAssignment: { create: { roleId: user.roleId } },
          employeeProfile: { create: { createdById, ...hrData(fields) } },
        },
        select: { employeeProfile: { select: EMPLOYEE_SELECT } },
      });
      return toRecord(created.employeeProfile!);
    } catch (error) {
      if (isUniqueViolation(error, "users_email_key", "email")) {
        return "email_conflict";
      }
      if (
        isUniqueViolation(
          error,
          "employee_profiles_employee_code_key",
          "employeeCode",
          "employee_code",
        )
      ) {
        return "code_conflict";
      }
      if (isPrismaKnownError(error, "P2003")) return "invalid_reference";
      throw error;
    }
  }

  /** Updates HR fields and, optionally, the linked user's own display fields. */
  async update(
    id: string,
    fields: UpdateEmployeeFields,
  ): Promise<EmployeeRecord | "not_found" | "invalid_reference"> {
    if (!isUuid(id)) return "not_found";
    const { firstName, lastName, personalPhone, ...hr } = fields;
    try {
      const updated = await this.db.$transaction(async (tx) => {
        if (
          firstName !== undefined ||
          lastName !== undefined ||
          personalPhone !== undefined
        ) {
          const current = await tx.employeeProfile.findUnique({
            where: { id },
            select: { userId: true },
          });
          if (!current) return null;
          await tx.user.update({
            where: { id: current.userId },
            data: {
              ...(firstName !== undefined ? { firstName } : {}),
              ...(lastName !== undefined ? { lastName } : {}),
              ...(personalPhone !== undefined ? { phone: personalPhone } : {}),
            },
          });
        }
        return tx.employeeProfile.update({
          where: { id },
          data: {
            ...(hr.position !== undefined ? { position: hr.position } : {}),
            ...(hr.employmentType !== undefined
              ? { employmentType: hr.employmentType }
              : {}),
            ...(hr.employmentDate !== undefined
              ? { employmentDate: hr.employmentDate }
              : {}),
            ...(hr.workLocation !== undefined
              ? { workLocation: hr.workLocation }
              : {}),
            ...(hr.reportingManagerId !== undefined
              ? { reportingManagerId: hr.reportingManagerId }
              : {}),
            ...(hr.grade !== undefined ? { grade: hr.grade } : {}),
            ...(hr.description !== undefined
              ? { description: hr.description }
              : {}),
            ...(hr.baseSalary !== undefined
              ? { baseSalary: hr.baseSalary }
              : {}),
            ...(hr.salaryScale !== undefined
              ? { salaryScale: hr.salaryScale }
              : {}),
            ...(hr.allowanceAmount !== undefined
              ? { allowanceAmount: hr.allowanceAmount }
              : {}),
            ...(hr.currency !== undefined ? { currency: hr.currency } : {}),
            ...(hr.gender !== undefined ? { gender: hr.gender } : {}),
            ...(hr.dateOfBirth !== undefined
              ? { dateOfBirth: hr.dateOfBirth }
              : {}),
            ...(hr.city !== undefined ? { city: hr.city } : {}),
            ...(hr.subCity !== undefined ? { subCity: hr.subCity } : {}),
            ...(hr.woreda !== undefined ? { woreda: hr.woreda } : {}),
            ...(hr.bankAccountNumber !== undefined
              ? { bankAccountNumber: hr.bankAccountNumber }
              : {}),
            ...(hr.companyPhone !== undefined
              ? { companyPhone: hr.companyPhone }
              : {}),
          },
          select: EMPLOYEE_SELECT,
        });
      });
      if (!updated) return "not_found";
      return toRecord(updated);
    } catch (error) {
      if (isPrismaKnownError(error, "P2025")) return "not_found";
      if (isPrismaKnownError(error, "P2003")) return "invalid_reference";
      throw error;
    }
  }

  /**
   * Sets employment status, stamping the audit trail, and - only for the
   * ACTIVE/INACTIVE transitions that mirror `UsersService.deactivate`/
   * `reactivate` - mirrors the same effect on the linked user's login
   * access. `ON_LEAVE` never touches login access.
   */
  async setStatus(
    id: string,
    status: EmploymentStatus,
    changedById: string,
  ): Promise<EmployeeRecord | "not_found"> {
    if (!isUuid(id)) return "not_found";
    try {
      const updated = await this.db.$transaction(async (tx) => {
        const current = await tx.employeeProfile.findUnique({
          where: { id },
          select: { userId: true },
        });
        if (!current) return null;
        if (status === "INACTIVE") {
          await tx.user.update({
            where: { id: current.userId },
            data: { status: "INACTIVE", deactivatedAt: new Date() },
          });
        } else if (status === "ACTIVE") {
          await tx.user.update({
            where: { id: current.userId },
            data: { status: "ACTIVE", deactivatedAt: null },
          });
        }
        return tx.employeeProfile.update({
          where: { id },
          data: {
            employmentStatus: status,
            statusChangedAt: new Date(),
            statusChangedById: changedById,
          },
          select: EMPLOYEE_SELECT,
        });
      });
      if (!updated) return "not_found";
      return toRecord(updated);
    } catch (error) {
      if (isPrismaKnownError(error, "P2025")) return "not_found";
      throw error;
    }
  }
}

function isPrismaKnownError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

/**
 * Prisma reports `meta.target` as either the constraint name (Postgres) or
 * the field name array, depending on how the write reached the DB - check
 * for either shape rather than assuming one.
 */
function isUniqueViolation(error: unknown, ...needles: string[]): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.["target"];
  const haystack = Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : "";
  return needles.some((needle) => haystack.includes(needle));
}
