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
import { AccessTokenGuard } from "../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { unauthenticated } from "../auth/auth.errors.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import type { RequestWithContext } from "../common/http/request-with-context.js";
import { RequirePermissions } from "../common/security/permissions.decorator.js";
import { PermissionsGuard } from "../common/security/permissions.guard.js";
import {
  PaginatedProductionsResponse,
  ProductionResponse,
} from "./productions.contracts.js";
import { ProductionsService } from "./productions.service.js";
import { AssignProductionManagerDto } from "./dto/assign-production-manager.dto.js";
import { AssignProductionTalentDto } from "./dto/assign-production-talent.dto.js";
import { CreateProductionDto } from "./dto/create-production.dto.js";
import { ListProductionsQueryDto } from "./dto/list-productions-query.dto.js";
import { TransitionProductionDto } from "./dto/transition-production.dto.js";
import { UpdateProductionDto } from "./dto/update-production.dto.js";

function actor(request: RequestWithContext) {
  if (!request.user?.userId) throw unauthenticated();
  return request.user.userId;
}

@ApiTags("Production management")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({ type: ProblemDetails })
@ApiForbiddenResponse({ type: ProblemDetails })
@ApiNotFoundResponse({ type: ProblemDetails })
@ApiConflictResponse({ type: ProblemDetails })
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("productions")
export class ProductionsController {
  constructor(private readonly service: ProductionsService) {}

  @Get()
  @RequirePermissions("project.read")
  @ApiOperation({ summary: "List production projects" })
  @ApiOkResponse({ type: PaginatedProductionsResponse })
  list(
    @Req() request: RequestWithContext,
    @Query() query: ListProductionsQueryDto,
  ) {
    return this.service.list(actor(request), query);
  }

  @Get(":id")
  @RequirePermissions("project.read")
  @ApiOperation({
    summary: "Get a production and connected workspace overview",
  })
  @ApiOkResponse({ type: ProductionResponse })
  get(@Req() request: RequestWithContext, @Param("id") id: string) {
    return this.service.get(actor(request), id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.create")
  @ApiOperation({ summary: "Create a production with its connected workspace" })
  @ApiCreatedResponse({ type: ProductionResponse })
  create(
    @Req() request: RequestWithContext,
    @Body() body: CreateProductionDto,
  ) {
    return this.service.create(actor(request), body);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.update")
  @ApiOperation({ summary: "Update production details" })
  @ApiOkResponse({ type: ProductionResponse })
  update(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateProductionDto,
  ) {
    return this.service.update(actor(request), id, body);
  }

  @Post(":id/transition")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.transition_status")
  @ApiOperation({ summary: "Move a production through its lifecycle" })
  @ApiOkResponse({ type: ProductionResponse })
  transition(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: TransitionProductionDto,
  ) {
    return this.service.transition(actor(request), id, body.status);
  }

  @Put(":id/manager")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Set or clear the production manager" })
  @ApiOkResponse({ type: ProductionResponse })
  setManager(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: AssignProductionManagerDto,
  ) {
    return this.service.setManager(actor(request), id, body.managerId);
  }

  @Put(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Assign a team" })
  @ApiOkResponse({ type: ProductionResponse })
  assignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ) {
    return this.service.assignTeam(actor(request), id, teamId);
  }

  @Delete(":id/teams/:teamId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Unassign a team" })
  @ApiOkResponse({ type: ProductionResponse })
  unassignTeam(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("teamId") teamId: string,
  ) {
    return this.service.unassignTeam(actor(request), id, teamId);
  }

  @Put(":id/participants/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Add a production participant" })
  @ApiOkResponse({ type: ProductionResponse })
  addParticipant(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.service.addParticipant(actor(request), id, userId);
  }

  @Delete(":id/participants/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Remove a production participant" })
  @ApiOkResponse({ type: ProductionResponse })
  removeParticipant(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.service.removeParticipant(actor(request), id, userId);
  }

  @Put(":id/talents/:talentId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Assign talent to a production" })
  @ApiOkResponse({ type: ProductionResponse })
  assignTalent(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("talentId") talentId: string,
    @Body() body: AssignProductionTalentDto,
  ) {
    return this.service.assignTalent(actor(request), id, talentId, body.role);
  }

  @Delete(":id/talents/:talentId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.assign")
  @ApiOperation({ summary: "Unassign talent from a production" })
  @ApiOkResponse({ type: ProductionResponse })
  unassignTalent(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("talentId") talentId: string,
  ) {
    return this.service.unassignTalent(actor(request), id, talentId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("project.delete")
  @ApiOperation({ summary: "Delete a production and its workspace" })
  @ApiNoContentResponse()
  async remove(@Req() request: RequestWithContext, @Param("id") id: string) {
    await this.service.remove(actor(request), id);
  }
}
