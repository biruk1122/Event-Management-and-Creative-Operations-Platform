import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Response } from "express";
import { AccessTokenGuard } from "../../auth/guards/access-token.guard.js";
import { CsrfGuard } from "../../auth/guards/csrf.guard.js";
import type { RequestWithContext } from "../../common/http/request-with-context.js";
import { GoogleMeetConfig } from "./google-meet.config.js";
import { GoogleMeetService } from "./google-meet.service.js";

export class MeetStatusResponse {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() connection!: string;
  @ApiProperty() exportState!: string;
  @ApiProperty({ type: String, nullable: true }) failure!: string | null;
}
export class MeetAuthorizeResponse {
  @ApiProperty({ format: "uri" }) url!: string;
}
export class MeetDisconnectResponse {
  @ApiProperty() remoteRevoked!: boolean;
}
export class MeetCallbackQuery {
  @IsString() @MaxLength(256) state!: string;
  @IsOptional() @IsString() @MaxLength(4096) code?: string;
  @IsOptional() @IsString() @MaxLength(256) error?: string;
  @IsOptional() @IsString() @MaxLength(4096) scope?: string;
  @IsOptional() @IsString() @MaxLength(256) authuser?: string;
  @IsOptional() @IsString() @MaxLength(256) prompt?: string;
}

@ApiTags("Meetings")
@ApiCookieAuth("access_token")
@UseGuards(AccessTokenGuard)
@Controller("meetings")
export class GoogleMeetController {
  constructor(
    private readonly service: GoogleMeetService,
    private readonly config: GoogleMeetConfig,
  ) {}

  @Post("google-calendar/authorize")
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: MeetAuthorizeResponse })
  @HttpCode(200)
  async authorize(
    @Req() req: RequestWithContext,
  ): Promise<MeetAuthorizeResponse> {
    return {
      url: await this.service.authorize(req.user!.userId, req.user!.sessionId),
    };
  }
  @Get("google-calendar/callback")
  async callback(
    @Req() req: RequestWithContext,
    @Query() query: MeetCallbackQuery,
    @Res() res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    // No codes/tokens/error payloads are reflected to the browser or logged.
    try {
      await this.service.callback(
        req.user!.userId,
        req.user!.sessionId,
        query.state,
        query.error ? undefined : query.code,
      );
    } catch {
      /* Connection status remains disconnected; UI offers retry/manual. */
    }
    if (!this.config.env.GOOGLE_MEET_RETURN_URL)
      return res
        .status(409)
        .send("Google Calendar is disabled. Return to Lela meetings.");
    return res.redirect(303, this.config.env.GOOGLE_MEET_RETURN_URL);
  }
  @Delete("google-calendar/connection")
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: MeetDisconnectResponse })
  disconnect(@Req() req: RequestWithContext): Promise<MeetDisconnectResponse> {
    return this.service.disconnect(req.user!.userId);
  }
  @Post("google-calendar/rotate-key")
  @UseGuards(CsrfGuard)
  @HttpCode(204)
  rotate(@Req() req: RequestWithContext) {
    return this.service.rotate(req.user!.userId);
  }

  @Get(":id/google-meet")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: MeetStatusResponse })
  status(
    @Req() req: RequestWithContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<MeetStatusResponse> {
    return this.service.status(req.user!.userId, id);
  }
  @Post(":id/google-meet")
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: MeetStatusResponse })
  @HttpCode(200)
  async sync(
    @Req() req: RequestWithContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<MeetStatusResponse> {
    await this.service.synchronize(req.user!.userId, id);
    return this.service.status(req.user!.userId, id);
  }
  @Delete(":id/google-meet")
  @UseGuards(CsrfGuard)
  @ApiOkResponse({ type: MeetStatusResponse })
  async cleanup(
    @Req() req: RequestWithContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<MeetStatusResponse> {
    await this.service.synchronize(req.user!.userId, id, true);
    return this.service.status(req.user!.userId, id);
  }
}
