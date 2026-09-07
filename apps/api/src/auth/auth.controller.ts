import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request, Response } from "express";

import type { RequestWithContext } from "../common/http/request-with-context.js";
import { ProblemDetails } from "../common/http/problem-details.js";
import { PermissionsService } from "../common/security/permissions.service.js";
import {
  AuthenticatedUserResponse,
  CurrentAccessResponse,
  SessionResponse,
} from "./auth.contracts.js";
import { unauthenticated } from "./auth.errors.js";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { AccessTokenGuard } from "./guards/access-token.guard.js";
import { CsrfGuard } from "./guards/csrf.guard.js";

@ApiTags("Authentication")
@ApiBadRequestResponse({
  type: ProblemDetails,
  description: "Validation failed",
})
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get("me/permissions")
  @Header("Cache-Control", "private, no-store")
  @UseGuards(AccessTokenGuard)
  @ApiCookieAuth("access_token")
  @ApiOperation({
    summary: "Return the current account's effective permission scopes",
  })
  @ApiOkResponse({ type: CurrentAccessResponse })
  @ApiUnauthorizedResponse({
    type: ProblemDetails,
    description: "Not authenticated",
  })
  async access(
    @Req() request: RequestWithContext,
  ): Promise<CurrentAccessResponse> {
    const userId = request.user?.userId;
    if (!userId) throw unauthenticated();
    return {
      userId,
      grants: await this.permissions.getEffectiveGrants(userId),
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Exchange email and password for session cookies",
  })
  @ApiOkResponse({ type: SessionResponse })
  @ApiUnauthorizedResponse({
    type: ProblemDetails,
    description: "Invalid credentials",
  })
  @ApiForbiddenResponse({
    type: ProblemDetails,
    description: "Account inactive or locked",
  })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const user = await this.authService.login(request, response, body);
    return { user };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Rotate the refresh session and reissue cookies" })
  @ApiOkResponse({ type: SessionResponse })
  @ApiUnauthorizedResponse({
    type: ProblemDetails,
    description: "Missing, expired, revoked, or replayed session",
  })
  @ApiForbiddenResponse({
    type: ProblemDetails,
    description: "CSRF token invalid",
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const user = await this.authService.refresh(request, response);
    return { user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @ApiOperation({ summary: "Revoke the current session and clear cookies" })
  @ApiForbiddenResponse({
    type: ProblemDetails,
    description: "CSRF token invalid",
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request, response);
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  @ApiCookieAuth("access_token")
  @ApiOperation({ summary: "Return the authenticated account" })
  @ApiOkResponse({ type: AuthenticatedUserResponse })
  @ApiUnauthorizedResponse({
    type: ProblemDetails,
    description: "Not authenticated",
  })
  async me(
    @Req() request: RequestWithContext,
  ): Promise<AuthenticatedUserResponse> {
    const userId = request.user?.userId;
    if (!userId) {
      throw unauthenticated();
    }
    const user = await this.authService.currentUser(userId);
    if (!user) {
      throw unauthenticated();
    }
    return user;
  }
}
