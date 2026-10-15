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
  Req,
  UseGuards,
} from "@nestjs/common";
import {
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
import { CreateProductionLocationDto } from "./dto/create-production-location.dto.js";
import { UpdateProductionLocationDto } from "./dto/update-production-location.dto.js";
import {
  ProductionLocationResponse,
  ProductionLocationsResponse,
} from "./production-locations.contracts.js";
import { ProductionLocationsService } from "./production-locations.service.js";

function actor(request: RequestWithContext): string {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

@ApiTags("Production management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiNotFoundResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("productions/:productionId/locations")
export class ProductionLocationsController {
  constructor(private readonly service: ProductionLocationsService) {}

  @Get()
  @RequirePermissions("project.read")
  @ApiOperation({ summary: "List a production's locations" })
  @ApiOkResponse({ type: ProductionLocationsResponse })
  async list(
    @Req() request: RequestWithContext,
    @Param("productionId") productionId: string,
  ): Promise<ProductionLocationsResponse> {
    return { items: await this.service.list(actor(request), productionId) };
  }

  @Get(":id")
  @RequirePermissions("project.read")
  @ApiOperation({ summary: "Get one production location" })
  @ApiOkResponse({ type: ProductionLocationResponse })
  get(
    @Req() request: RequestWithContext,
    @Param("productionId") productionId: string,
    @Param("id") id: string,
  ) {
    return this.service.get(actor(request), productionId, id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.update")
  @ApiOperation({ summary: "Add a location to a production" })
  @ApiCreatedResponse({ type: ProductionLocationResponse })
  create(
    @Req() request: RequestWithContext,
    @Param("productionId") productionId: string,
    @Body() body: CreateProductionLocationDto,
  ) {
    return this.service.create(actor(request), productionId, body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.update")
  @ApiOperation({ summary: "Update a production location" })
  @ApiOkResponse({ type: ProductionLocationResponse })
  update(
    @Req() request: RequestWithContext,
    @Param("productionId") productionId: string,
    @Param("id") id: string,
    @Body() body: UpdateProductionLocationDto,
  ) {
    return this.service.update(actor(request), productionId, id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.update")
  @ApiOperation({ summary: "Remove a production location" })
  @ApiNoContentResponse()
  async remove(
    @Req() request: RequestWithContext,
    @Param("productionId") productionId: string,
    @Param("id") id: string,
  ) {
    await this.service.remove(actor(request), productionId, id);
  }
}
