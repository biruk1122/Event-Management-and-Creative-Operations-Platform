import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { unauthenticated } from "../auth/auth.errors.js";
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import {
  DepartmentResponse,
  PaginatedDepartmentsResponse,
} from "./departments.contracts.js";
import { DepartmentsService } from "./departments.service.js";
import { AssignDepartmentManagerDto } from "./dto/assign-department-manager.dto.js";
import { CreateDepartmentDto } from "./dto/create-department.dto.js";
import { ListDepartmentsQueryDto } from "./dto/list-departments-query.dto.js";
import { UpdateDepartmentDto } from "./dto/update-department.dto.js";

/** `AccessTokenGuard` always runs first in this controller's guard chain and
 * sets `request.user`; this only guards against that invariant changing. */
function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw unauthenticated();
  }
  return userId;
}

@ApiTags("Department management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description: "Missing permission, out of read scope, or CSRF token invalid",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("departments")
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @RequirePermissions("department.read")
  @ApiOperation({
    summary: "List departments the caller may see, with optional filters",
  })
  @ApiOkResponse({ type: PaginatedDepartmentsResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListDepartmentsQueryDto,
  ): Promise<PaginatedDepartmentsResponse> {
    return this.departments.list(actingUserId(request), query);
  }

  @Get(":id")
  @RequirePermissions("department.read")
  @ApiOperation({ summary: "Get one department and its composition" })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Department not found",
  })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<DepartmentResponse> {
    return this.departments.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("department.create")
  @ApiOperation({ summary: "Create a department" })
  @ApiCreatedResponse({ type: DepartmentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The requested manager user does not exist",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A department with that name already exists",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateDepartmentDto,
  ): Promise<DepartmentResponse> {
    return this.departments.create(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("department.update")
  @ApiOperation({ summary: "Update a department's name or description" })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Department not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A department with that name already exists",
  })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateDepartmentDto,
  ): Promise<DepartmentResponse> {
    return this.departments.update(actingUserId(request), id, body);
  }

  @Put(":id/manager")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("department.assign_manager")
  @ApiOperation({ summary: "Set, change, or clear a department's manager" })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The department or the requested manager user does not exist",
  })
  async setManager(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AssignDepartmentManagerDto,
  ): Promise<DepartmentResponse> {
    return this.departments.setManager(
      actingUserId(request),
      id,
      body.managerId,
    );
  }

  @Post(":id/deactivate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("department.update")
  @ApiOperation({ summary: "Deactivate a department (safe deactivation)" })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Department not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The department is already deactivated",
  })
  async deactivate(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<DepartmentResponse> {
    return this.departments.deactivate(actingUserId(request), id);
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("department.update")
  @ApiOperation({ summary: "Reactivate a deactivated department" })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Department not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The department is already active",
  })
  async reactivate(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<DepartmentResponse> {
    return this.departments.reactivate(actingUserId(request), id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("department.delete")
  @ApiOperation({
    summary: "Remove a department that has no employees or teams",
  })
  @ApiNoContentResponse({ description: "The department was removed" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Department not found",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The department still has employees or teams",
  })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.departments.remove(actingUserId(request), id);
  }

  @Put(":id/employees/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("user.assign_department")
  @ApiOperation({
    summary: "Assign a user to this department (moving them if needed)",
  })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The department or the user does not exist",
  })
  async assignEmployee(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<DepartmentResponse> {
    return this.departments.assignEmployee(actingUserId(request), id, userId);
  }

  @Delete(":id/employees/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("user.assign_department")
  @ApiOperation({ summary: "Remove a user from this department" })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The department or the user does not exist",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "That user is not assigned to this department",
  })
  async removeEmployee(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<DepartmentResponse> {
    return this.departments.removeEmployee(actingUserId(request), id, userId);
  }
}
