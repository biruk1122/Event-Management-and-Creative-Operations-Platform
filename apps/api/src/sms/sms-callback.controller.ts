import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";

import { SmsCallbackQueryDto } from "./sms.dto.js";
import { SmsService } from "./sms.service.js";

/**
 * The provider's delivery callback. It has no session, so it is protected only
 * by the unguessable token in the path, checked in constant time. It is kept
 * out of the public API document. Every refusal returns the same 404, and a
 * valid callback always gets 204, whatever the message.
 */
@Controller("sms/callbacks")
export class SmsCallbackController {
  constructor(private readonly sms: SmsService) {}

  @Get(":token")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiExcludeEndpoint()
  async receive(
    @Param("token") token: string,
    @Query() query: SmsCallbackQueryDto,
  ): Promise<void> {
    await this.sms.handleCallback(token, query.message_id, query.status);
  }
}
