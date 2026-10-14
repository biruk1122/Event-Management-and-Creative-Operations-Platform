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
import { CreateSupplierDto } from "./dto/create-supplier.dto.js";
import { ListSuppliersQueryDto } from "./dto/list-suppliers-query.dto.js";
import { UpdateSupplierDto } from "./dto/update-supplier.dto.js";
import {
  PaginatedSuppliersResponse,
  SupplierResponse,
} from "./suppliers.contracts.js";
import { SuppliersService } from "./suppliers.service.js";

function actingUserId(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

@ApiTags("Supplier directory")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions("supplier.read")
  @ApiOperation({ summary: "List suppliers visible to the caller" })
  @ApiOkResponse({ type: PaginatedSuppliersResponse })
  list(
    @Req() req: RequestWithContext,
    @Query() query: ListSuppliersQueryDto,
  ): Promise<PaginatedSuppliersResponse> {
    return this.suppliers.list(actingUserId(req), query);
  }

  @Get(":id")
  @RequirePermissions("supplier.read")
  @ApiOperation({ summary: "Get one supplier" })
  @ApiOkResponse({ type: SupplierResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  get(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
  ): Promise<SupplierResponse> {
    return this.suppliers.get(actingUserId(req), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("supplier.create")
  @ApiOperation({ summary: "Register a supplier" })
  @ApiCreatedResponse({ type: SupplierResponse })
  @ApiConflictResponse({ type: ProblemDetails })
  create(
    @Req() req: RequestWithContext,
    @Body() body: CreateSupplierDto,
  ): Promise<SupplierResponse> {
    return this.suppliers.create(actingUserId(req), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("supplier.update")
  @ApiOperation({ summary: "Edit a supplier or change its status" })
  @ApiOkResponse({ type: SupplierResponse })
  @ApiNotFoundResponse({ type: ProblemDetails })
  @ApiConflictResponse({ type: ProblemDetails })
  update(
    @Req() req: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateSupplierDto,
  ): Promise<SupplierResponse> {
    return this.suppliers.update(actingUserId(req), id, body);
  }
}
