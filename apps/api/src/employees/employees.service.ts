import { Injectable } from "@nestjs/common";

import { PasswordHasher } from "../auth/domain/password-hasher.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import { permissionDenied } from "../common/security/security.errors.js";
import {
  isHrExecutiveOfficerManager,
  platformRole,
  supportedDepartment,
} from "../common/security/department-access.policy.js";
import { roleNotFound as userRoleNotFound } from "../users/users.errors.js";
import type { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import type { ListEmployeesQueryDto } from "./dto/list-employees-query.dto.js";
import type { UpdateEmployeeDto } from "./dto/update-employee.dto.js";
import type { UpdateEmployeeStatusDto } from "./dto/update-employee-status.dto.js";
import {
  employeeAlreadyInStatus,
  employeeAssignmentInvalid,
  employeeCodeConflict,
  employeeEmailConflict,
  employeeNotFound,
  employeeUserAlreadyLinked,
  employeeUserNotFound,
} from "./employees.errors.js";
import {
  EmployeesRepository,
  type EmployeeRecord,
  type HrFields,
} from "./infrastructure/employees.repository.js";
import type {
  EmployeeOptionsResponse,
  EmployeeResponse,
  PaginatedEmployeesResponse,
} from "./employees.contracts.js";
import { DatabaseService } from "../database/database.service.js";

function toResponse(employee: EmployeeRecord): EmployeeResponse {
  return {
    id: employee.id,
    userId: employee.userId,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    personalPhone: employee.personalPhone,
    companyPhone: employee.companyPhone,
    gender: employee.gender,
    dateOfBirth: employee.dateOfBirth
      ? employee.dateOfBirth.toISOString().slice(0, 10)
      : null,
    city: employee.city,
    subCity: employee.subCity,
    woreda: employee.woreda,
    bankAccountNumber: employee.bankAccountNumber,
    departmentId: employee.departmentId,
    departmentName: employee.departmentName,
    position: employee.position,
    employmentType: employee.employmentType,
    employmentDate: employee.employmentDate.toISOString().slice(0, 10),
    employmentStatus: employee.employmentStatus,
    workLocation: employee.workLocation,
    reportingManagerId: employee.reportingManagerId,
    reportingManagerName: employee.reportingManagerName,
    grade: employee.grade,
    description: employee.description,
    baseSalary: employee.baseSalary,
    salaryScale: employee.salaryScale,
    allowanceAmount: employee.allowanceAmount,
    currency: employee.currency,
    totalCompensation: employee.totalCompensation,
    userStatus: employee.userStatus,
    statusChangedAt: employee.statusChangedAt
      ? employee.statusChangedAt.toISOString()
      : null,
    statusChangedById: employee.statusChangedById,
    createdById: employee.createdById,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

function hrFieldsFrom(dto: {
  employeeCode: string;
  position: string;
  employmentType: HrFields["employmentType"];
  employmentDate: string;
  workLocation?: string;
  reportingManagerId?: string;
  grade?: string;
  description?: string;
  baseSalary?: number;
  salaryScale?: string;
  allowanceAmount?: number;
  currency?: string;
  gender?: HrFields["gender"];
  dateOfBirth?: string;
  city?: string;
  subCity?: string;
  woreda?: string;
  bankAccountNumber?: string;
  companyPhone?: string;
}): HrFields {
  return {
    employeeCode: dto.employeeCode.trim(),
    position: dto.position.trim(),
    employmentType: dto.employmentType,
    employmentDate: new Date(dto.employmentDate),
    workLocation: dto.workLocation?.trim() ?? null,
    reportingManagerId: dto.reportingManagerId ?? null,
    grade: dto.grade?.trim() ?? null,
    description: dto.description?.trim() ?? null,
    baseSalary: dto.baseSalary ?? null,
    salaryScale: dto.salaryScale?.trim() ?? null,
    allowanceAmount: dto.allowanceAmount ?? null,
    currency: dto.currency ?? null,
    gender: dto.gender ?? null,
    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
    city: dto.city?.trim() ?? null,
    subCity: dto.subCity?.trim() ?? null,
    woreda: dto.woreda?.trim() ?? null,
    bankAccountNumber: dto.bankAccountNumber?.trim() ?? null,
    companyPhone: dto.companyPhone?.trim() ?? null,
  };
}

/** Compensation amounts and currency are all-or-nothing (mirrors the DB CHECK). */
function assertCompensationPaired(
  baseSalary: number | null | undefined,
  allowanceAmount: number | null | undefined,
  currency: string | null | undefined,
): void {
  const hasAmount =
    (baseSalary !== undefined && baseSalary !== null) ||
    (allowanceAmount !== undefined && allowanceAmount !== null);
  const hasCurrency = currency !== undefined && currency !== null;
  if (hasAmount && !hasCurrency) {
    throw employeeAssignmentInvalid(
      "Set a currency when recording a base salary or allowance.",
    );
  }
  if (hasCurrency && !hasAmount) {
    throw employeeAssignmentInvalid(
      "Set a base salary or allowance when recording a currency.",
    );
  }
}

/**
 * Application service for employee management (EMP-01). The real
 * authorization boundary lives in {@link requireEmployeeAccess}: Super Admin
 * reaches every operation at organization scope; a Department Manager
 * reaches it only when their own department is HR & Executive Officer, in
 * which case access resolves to every department's employees, not just
 * HR's own - an HR Manager administers the whole roster. No other role or
 * department ever passes this check, and holding it never depends on a new
 * role or a per-department branch in the RBAC catalog - both keys are
 * granted generically to every Department Manager; this check is what makes
 * the grant inert for every department except HR & Executive Officer.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly repository: EmployeesRepository,
    private readonly permissions: PermissionsService,
    private readonly passwordHasher: PasswordHasher,
    private readonly db: DatabaseService,
  ) {}

  private async requireEmployeeAccess(
    actingUserId: string,
    permissionKey: string,
  ): Promise<void> {
    const context = await this.permissions.getAccessContext(actingUserId);
    if (context.role === "SUPER_ADMIN") {
      if (
        await this.permissions.hasGrant(
          actingUserId,
          permissionKey,
          "ORGANIZATION",
        )
      ) {
        return;
      }
      throw permissionDenied();
    }
    const isHrManager = isHrExecutiveOfficerManager(context);
    if (
      isHrManager &&
      (await this.permissions.hasGrant(
        actingUserId,
        permissionKey,
        "DEPARTMENT",
      ))
    ) {
      return;
    }
    throw permissionDenied();
  }

  private async validateNewUserAssignment(
    roleId: string,
    departmentId: string,
  ): Promise<void> {
    const role = await this.db.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, isSystem: true },
    });
    if (!role) throw userRoleNotFound();
    const code = role.isSystem ? platformRole(role.name) : null;
    if (code !== "DEPARTMENT_MANAGER" && code !== "DEPARTMENT_MEMBER") {
      throw employeeAssignmentInvalid(
        "Choose a Department Manager or Department Member role. A Super Admin account cannot be created through employee registration.",
      );
    }
    const department = await this.db.department.findUnique({
      where: { id: departmentId },
      select: { deactivatedAt: true, name: true },
    });
    if (
      !department ||
      department.deactivatedAt ||
      !supportedDepartment(department.name)
    ) {
      throw employeeAssignmentInvalid("Choose an active platform department.");
    }
  }

  async list(
    actingUserId: string,
    query: ListEmployeesQueryDto,
  ): Promise<PaginatedEmployeesResponse> {
    await this.requireEmployeeAccess(actingUserId, "employee.read");
    const result = await this.repository.list({
      ...(query.search ? { search: query.search.trim() } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.position ? { position: query.position.trim() } : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.employmentStatus
        ? { employmentStatus: query.employmentStatus }
        : {}),
      ...(query.workLocation
        ? { workLocation: query.workLocation.trim() }
        : {}),
      sort: query.sort,
      direction: query.direction,
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

  async get(actingUserId: string, id: string): Promise<EmployeeResponse> {
    await this.requireEmployeeAccess(actingUserId, "employee.read");
    const employee = await this.repository.findById(id);
    if (!employee) throw employeeNotFound();
    return toResponse(employee);
  }

  async findLinkableUsers(
    actingUserId: string,
    search: string,
  ): Promise<
    {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }[]
  > {
    await this.requireEmployeeAccess(actingUserId, "employee.create");
    const trimmed = search.trim();
    if (!trimmed) return [];
    return this.repository.findLinkableUsers(trimmed);
  }

  async options(actingUserId: string): Promise<EmployeeOptionsResponse> {
    await this.requireEmployeeAccess(actingUserId, "employee.read");
    const departments = await this.db.department.findMany({
      where: { deactivatedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return {
      departments,
      employmentTypes: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"],
      employmentStatuses: ["ACTIVE", "ON_LEAVE", "INACTIVE"],
      genders: ["MALE", "FEMALE", "OTHER"],
    };
  }

  async register(
    actingUserId: string,
    dto: CreateEmployeeDto,
  ): Promise<EmployeeResponse> {
    await this.requireEmployeeAccess(actingUserId, "employee.create");
    assertCompensationPaired(dto.baseSalary, dto.allowanceAmount, dto.currency);

    const hr = hrFieldsFrom(dto);

    if (dto.userId) {
      const existing = await this.repository.findByUserId(dto.userId);
      if (existing) throw employeeUserAlreadyLinked();
      const result = await this.repository.createForExistingUser(
        dto.userId,
        actingUserId,
        hr,
      );
      if (result === "user_not_found") throw employeeUserNotFound();
      if (result === "already_linked") throw employeeUserAlreadyLinked();
      if (result === "code_conflict") throw employeeCodeConflict();
      if (result === "invalid_reference") {
        throw employeeAssignmentInvalid(
          "The reporting manager does not exist.",
        );
      }
      return toResponse(result);
    }

    if (
      !dto.email ||
      !dto.firstName ||
      !dto.lastName ||
      !dto.temporaryPassword ||
      !dto.roleId ||
      !dto.departmentId
    ) {
      throw employeeAssignmentInvalid(
        "email, firstName, lastName, temporaryPassword, roleId, and departmentId are required to create a new account.",
      );
    }
    await this.validateNewUserAssignment(dto.roleId, dto.departmentId);

    const passwordHash = await this.passwordHasher.hash(dto.temporaryPassword);
    const result = await this.repository.createForNewUser(
      actingUserId,
      {
        email: dto.email.toLowerCase(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        personalPhone: dto.personalPhone?.trim() ?? null,
        passwordHash,
        roleId: dto.roleId,
        departmentId: dto.departmentId,
      },
      hr,
    );
    if (result === "email_conflict") throw employeeEmailConflict();
    if (result === "code_conflict") throw employeeCodeConflict();
    if (result === "invalid_reference") {
      throw employeeAssignmentInvalid("The reporting manager does not exist.");
    }
    return toResponse(result);
  }

  async update(
    actingUserId: string,
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeResponse> {
    await this.requireEmployeeAccess(actingUserId, "employee.update");
    const current = await this.repository.findById(id);
    if (!current) throw employeeNotFound();

    const nextBaseSalary =
      dto.baseSalary !== undefined
        ? dto.baseSalary
        : current.baseSalary === null
          ? null
          : Number(current.baseSalary);
    const nextAllowance =
      dto.allowanceAmount !== undefined
        ? dto.allowanceAmount
        : current.allowanceAmount === null
          ? null
          : Number(current.allowanceAmount);
    const nextCurrency =
      dto.currency !== undefined ? dto.currency : current.currency;
    assertCompensationPaired(nextBaseSalary, nextAllowance, nextCurrency);

    if (dto.reportingManagerId === id) {
      throw employeeAssignmentInvalid(
        "An employee cannot be their own reporting manager.",
      );
    }

    const result = await this.repository.update(id, {
      ...(dto.firstName !== undefined
        ? { firstName: dto.firstName.trim() }
        : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
      ...(dto.personalPhone !== undefined
        ? { personalPhone: dto.personalPhone.trim() }
        : {}),
      ...(dto.position !== undefined ? { position: dto.position.trim() } : {}),
      ...(dto.employmentType !== undefined
        ? { employmentType: dto.employmentType }
        : {}),
      ...(dto.employmentDate !== undefined
        ? { employmentDate: new Date(dto.employmentDate) }
        : {}),
      ...(dto.workLocation !== undefined
        ? { workLocation: dto.workLocation?.trim() ?? null }
        : {}),
      ...(dto.reportingManagerId !== undefined
        ? { reportingManagerId: dto.reportingManagerId }
        : {}),
      ...(dto.grade !== undefined ? { grade: dto.grade?.trim() ?? null } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() ?? null }
        : {}),
      ...(dto.baseSalary !== undefined ? { baseSalary: dto.baseSalary } : {}),
      ...(dto.salaryScale !== undefined
        ? { salaryScale: dto.salaryScale?.trim() ?? null }
        : {}),
      ...(dto.allowanceAmount !== undefined
        ? { allowanceAmount: dto.allowanceAmount }
        : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...(dto.dateOfBirth !== undefined
        ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
        : {}),
      ...(dto.city !== undefined ? { city: dto.city?.trim() ?? null } : {}),
      ...(dto.subCity !== undefined
        ? { subCity: dto.subCity?.trim() ?? null }
        : {}),
      ...(dto.woreda !== undefined
        ? { woreda: dto.woreda?.trim() ?? null }
        : {}),
      ...(dto.bankAccountNumber !== undefined
        ? { bankAccountNumber: dto.bankAccountNumber?.trim() ?? null }
        : {}),
      ...(dto.companyPhone !== undefined
        ? { companyPhone: dto.companyPhone?.trim() ?? null }
        : {}),
    });

    if (result === "not_found") throw employeeNotFound();
    if (result === "invalid_reference") {
      throw employeeAssignmentInvalid("The reporting manager does not exist.");
    }
    return toResponse(result);
  }

  async updateStatus(
    actingUserId: string,
    id: string,
    dto: UpdateEmployeeStatusDto,
  ): Promise<EmployeeResponse> {
    await this.requireEmployeeAccess(actingUserId, "employee.status.update");
    const current = await this.repository.findById(id);
    if (!current) throw employeeNotFound();
    if (current.employmentStatus === dto.status) {
      throw employeeAlreadyInStatus();
    }
    if (
      dto.status === "INACTIVE" &&
      platformRole(current.userRoleName ?? "") === "SUPER_ADMIN"
    ) {
      throw employeeAssignmentInvalid(
        "The Super Admin account must remain active.",
      );
    }

    const result = await this.repository.setStatus(
      id,
      dto.status,
      actingUserId,
    );
    if (result === "not_found") throw employeeNotFound();
    return toResponse(result);
  }
}
