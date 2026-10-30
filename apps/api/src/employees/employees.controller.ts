import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import { FindLinkableUsersQueryDto } from "./dto/find-linkable-users-query.dto.js";
import { ListEmployeesQueryDto } from "./dto/list-employees-query.dto.js";
import { UpdateEmployeeDto } from "./dto/update-employee.dto.js";
import { UpdateEmployeeStatusDto } from "./dto/update-employee-status.dto.js";
import {
  EmployeeOptionsResponse,
  EmployeeResponse,
  LinkableUserOption,
  PaginatedEmployeesResponse,
} from "./employees.contracts.js";
import { EmployeesService } from "./employees.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

/**
 * Every route here is gated by `employee.*` at the transport boundary (any
 * scope), then by `EmployeesService.requireEmployeeAccess` as the precise
 * boundary: only Super Admin, or the HR & Executive Officer department's
 * own manager, ever passes. A direct request with another role or
 * department's token is rejected by that second check even if it somehow
 * holds an `employee.*` grant - frontend route hiding is not the
 * enforcement mechanism (EMP-01).
 */
@ApiTags("Employee management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions("employee.read")
  @ApiOperation({ summary: "List employee profiles visible to the caller" })
  @ApiOkResponse({ type: PaginatedEmployeesResponse })
  list(
    @Req() req: RequestWithContext,
    @Query() query: ListEmployeesQueryDto,
  ): Promise<PaginatedEmployeesResponse> {
    return this.employees.list(actingUserId(req), query);
  }

  @Get("options")
  @RequirePermissions("employee.read")
  @ApiOperation({ summary: "Form options: departments and enum values" })
  @ApiOkResponse({ type: EmployeeOptionsResponse })
  options(@Req() req: RequestWithContext): Promise<EmployeeOptionsResponse> {
    return this.employees.options(actingUserId(req));
  }

  @Get("linkable-users")
  @RequirePermissions("employee.create")
  @ApiOperation({
    summary: "Search users without an employee profile, to link one",
  })
  @ApiOkResponse({ type: [LinkableUserOption] })
  findLinkableUsers(
    @Req() req: RequestWithContext,
    @Query() query: FindLinkableUsersQueryDto,
  ): Promise<LinkableUserOption[]> {
    return this.employees.findLinkableUsers(
      actingUserId(req),
      query.search ?? "",
    );
  }

  @Get(":id")
  @RequirePermissions("employee.read")
  @ApiOperation({ summary: "Get one employee profile" })
  @ApiOkResponse({ type: EmployeeResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  get(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<EmployeeResponse> {
    return this.employees.get(actingUserId(req), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("employee.create")
  @ApiOperation({
    summary: "Register an employee profile, linking or creating a user",
  })
  @ApiCreatedResponse({ type: EmployeeResponse })
  @ApiConflictResponse({ type: ProblemDetails })
  register(
    @Req() req: RequestWithContext,
    @Body() body: CreateEmployeeDto,
  ): Promise<EmployeeResponse> {
    return this.employees.register(actingUserId(req), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("employee.update")
  @ApiOperation({ summary: "Edit an employee profile's HR fields" })
  @ApiOkResponse({ type: EmployeeResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  update(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateEmployeeDto,
  ): Promise<EmployeeResponse> {
    return this.employees.update(actingUserId(req), id, body);
  }

  @Patch(":id/status")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("employee.status.update")
  @ApiOperation({ summary: "Change an employee's employment status" })
  @ApiOkResponse({ type: EmployeeResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  updateStatus(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateEmployeeStatusDto,
  ): Promise<EmployeeResponse> {
    return this.employees.updateStatus(actingUserId(req), id, body);
  }
}
