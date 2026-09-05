import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { unauthenticated } from "../auth/auth.errors.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import { PermissionScope } from "../generated/prisma/enums.js";
import { AddRolePermissionDto } from "./dto/add-role-permission.dto.js";
import { CreateRoleDto } from "./dto/create-role.dto.js";
import { UpdateRoleDto } from "./dto/update-role.dto.js";
import {
  PermissionResponse,
  RoleResponse,
  RoleWithGrantsResponse,
} from "./rbac.contracts.js";
import { RbacService } from "./rbac.service.js";

/** `AccessTokenGuard` always runs first in this controller's guard chain and
 * sets `request.user`; this only guards against that invariant changing. */
function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw unauthenticated();
  }
  return userId;
}

@ApiTags("Roles and permissions")
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
@Controller("roles")
export class RolesController {
  constructor(private readonly rbac: RbacService) {}

  @Get()
  @RequirePermissions("role.read")
  @ApiOperation({ summary: "List configurable roles" })
  @ApiOkResponse({ type: [RoleResponse] })
  async list(@Req() request: RequestWithContext): Promise<RoleResponse[]> {
    return this.rbac.listRoles(actingUserId(request));
  }

  @Get(":id")
  @RequirePermissions("role.read")
  @ApiOperation({ summary: "Get one role and its permission grants" })
  @ApiOkResponse({ type: RoleWithGrantsResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Role not found" })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<RoleWithGrantsResponse> {
    return this.rbac.getRole(actingUserId(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("role.create")
  @ApiOperation({ summary: "Create a configurable role" })
  @ApiCreatedResponse({ type: RoleResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A role with that name already exists",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateRoleDto,
  ): Promise<RoleResponse> {
    return this.rbac.createRole(actingUserId(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("role.update")
  @ApiOperation({ summary: "Rename or describe a role" })
  @ApiOkResponse({ type: RoleResponse })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Role not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "A role with that name already exists",
  })
  async update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateRoleDto,
  ): Promise<RoleResponse> {
    return this.rbac.updateRole(actingUserId(request), id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("role.delete")
  @ApiOperation({ summary: "Remove a role that is not built in or in use" })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Role not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The role is built in or assigned to a user",
  })
  async remove(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.rbac.deleteRole(actingUserId(request), id);
  }

  @Post(":id/permissions")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("role.configure_permissions")
  @ApiOperation({ summary: "Grant a permission to a role at a scope" })
  @ApiCreatedResponse({ description: "The grant was added" })
  @ApiNotFoundResponse({ type: ProblemDetails, description: "Role not found" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The role already holds this grant",
  })
  async addPermission(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AddRolePermissionDto,
  ): Promise<void> {
    await this.rbac.addPermission(actingUserId(request), id, body);
  }

  @Delete(":id/permissions/:permissionKey/:scope")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("role.configure_permissions")
  @ApiOperation({ summary: "Remove a permission grant from a role" })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Role or grant not found",
  })
  async removePermission(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("permissionKey") permissionKey: string,
    @Param("scope", new ParseEnumPipe(PermissionScope)) scope: PermissionScope,
  ): Promise<void> {
    await this.rbac.removePermission(
      actingUserId(request),
      id,
      permissionKey,
      scope,
    );
  }
}

@ApiTags("Roles and permissions")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description: "Missing permission",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("permissions")
export class PermissionsController {
  constructor(private readonly rbac: RbacService) {}

  @Get()
  @RequirePermissions("role.read")
  @ApiOperation({ summary: "List the fixed permission catalog" })
  @ApiOkResponse({ type: [PermissionResponse] })
  async list(
    @Req() request: RequestWithContext,
  ): Promise<PermissionResponse[]> {
    return this.rbac.listPermissions(actingUserId(request));
  }
}
