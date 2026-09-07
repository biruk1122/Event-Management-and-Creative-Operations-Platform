import {
  Body,
  Controller,
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
import { AssignUserRoleDto } from "./dto/assign-user-role.dto.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { ListUsersQueryDto } from "./dto/list-users-query.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { PaginatedUsersResponse, UserResponse } from "./users.contracts.js";
import { UsersService } from "./users.service.js";

/** `AccessTokenGuard` always runs first in this controller's guard chain and
 * sets `request.user`; this only guards against that invariant changing. */
function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw unauthenticated();
  }
  return userId;
}

@ApiTags("User administration")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description: "Missing permission, or CSRF token invalid",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions("user.read")
  @ApiOperation({ summary: "List users with optional status and text filters" })
  @ApiOkResponse({ type: PaginatedUsersResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponse> {
    return this.users.list(actingUserId(request), query);
  }

  @Get(":id")
  @RequirePermissions("user.read")
  @ApiOperation({ summary: "Get one user account and profile" })
  @ApiOkResponse({ type: UserResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "User not found" })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<UserResponse> {
    return this.users.get(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("user.create")
  @ApiOperation({
    summary: "Create a user with an operator-set initial password",
  })
  @ApiCreatedResponse({ type: UserResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The requested role does not exist",
  })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A user with that email already exists",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateUserDto,
  ): Promise<UserResponse> {
    return this.users.create(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("user.update")
  @ApiOperation({ summary: "Update a user's email and profile fields" })
  @ApiOkResponse({ type: UserResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "User not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A user with that email already exists",
  })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserResponse> {
    return this.users.update(actingUserId(request), id, body);
  }

  @Post(":id/deactivate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("user.deactivate")
  @ApiOperation({
    summary: "Deactivate a user (User access Active -> Inactive)",
  })
  @ApiOkResponse({ type: UserResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "User not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The user is already deactivated",
  })
  async deactivate(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<UserResponse> {
    return this.users.deactivate(actingUserId(request), id);
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("user.manage_status")
  @ApiOperation({
    summary: "Reactivate a deactivated user (Inactive -> Active)",
  })
  @ApiOkResponse({ type: UserResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "User not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The user is already active",
  })
  async reactivate(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<UserResponse> {
    return this.users.reactivate(actingUserId(request), id);
  }

  @Put(":id/role")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("user.assign_role")
  @ApiOperation({ summary: "Assign, change, or clear a user's role" })
  @ApiOkResponse({ type: UserResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The user or the requested role does not exist",
  })
  async assignRole(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AssignUserRoleDto,
  ): Promise<UserResponse> {
    return this.users.assignRole(actingUserId(request), id, body.roleId);
  }
}
