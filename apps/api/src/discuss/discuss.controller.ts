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
  ApiBadRequestResponse,
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
import {
  ConversationResponse,
  MessageResponse,
  PaginatedConversationsResponse,
  PaginatedMessagesResponse,
} from "./discuss.contracts.js";
import { DiscussService } from "./discuss.service.js";
import { CreateChannelDto } from "./dto/create-channel.dto.js";
import { CreateConversationDto } from "./dto/create-conversation.dto.js";
import { CreateMessageDto } from "./dto/create-message.dto.js";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto.js";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto.js";
import { UpdateChannelDto } from "./dto/update-channel.dto.js";
import { UpdateMessageDto } from "./dto/update-message.dto.js";
import { UpdateReadCursorDto } from "./dto/update-read-cursor.dto.js";

function actingUserId(request: RequestWithContext): string {
  const userId = request.user?.userId;
  if (!userId) throw unauthenticated();
  return userId;
}

@ApiTags("Discuss")
@ApiCookieAuth("access_token")
@ApiUnauthorizedResponse({
  type: ProblemDetails,
  description: "Not authenticated",
})
@ApiForbiddenResponse({
  type: ProblemDetails,
  description:
    "Missing permission, outside the resolved scope, or invalid CSRF token",
})
@ApiBadRequestResponse({
  type: ProblemDetails,
  description: "Invalid request fields or channel owner",
})
@UseGuards(AccessTokenGuard, PermissionsGuard)
@Controller("conversations")
export class DiscussController {
  constructor(private readonly discuss: DiscussService) {}

  @Get()
  @RequirePermissions("conversation.read")
  @ApiOperation({
    summary: "List conversations and channels visible to the caller",
  })
  @ApiOkResponse({ type: PaginatedConversationsResponse })
  async list(
    @Req() request: RequestWithContext,
    @Query() query: ListConversationsQueryDto,
  ): Promise<PaginatedConversationsResponse> {
    return this.discuss.list(actingUserId(request), query);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("conversation.create")
  @ApiOperation({ summary: "Start a direct message or group conversation" })
  @ApiCreatedResponse({ type: ConversationResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "A member does not exist",
  })
  async create(
    @Req() request: RequestWithContext,
    @Body() body: CreateConversationDto,
  ): Promise<ConversationResponse> {
    return this.discuss.createDirectOrGroup(actingUserId(request), body);
  }

  @Post("channels")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("channel.create")
  @ApiOperation({
    summary: "Create a workspace, department, team, or general-purpose channel",
  })
  @ApiCreatedResponse({ type: ConversationResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "The named workspace, department, or team does not exist",
  })
  async createChannel(
    @Req() request: RequestWithContext,
    @Body() body: CreateChannelDto,
  ): Promise<ConversationResponse> {
    return this.discuss.createChannel(actingUserId(request), body);
  }

  @Get(":id")
  @RequirePermissions("conversation.read")
  @ApiOperation({ summary: "Get a conversation or channel and its members" })
  @ApiOkResponse({ type: ConversationResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Conversation not found",
  })
  async get(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
  ): Promise<ConversationResponse> {
    return this.discuss.get(actingUserId(request), id);
  }

  @Patch(":id")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("channel.manage")
  @ApiOperation({ summary: "Rename a channel or change its visibility" })
  @ApiOkResponse({ type: ConversationResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Conversation not found",
  })
  async updateChannel(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateChannelDto,
  ): Promise<ConversationResponse> {
    return this.discuss.updateChannel(actingUserId(request), id, body);
  }

  @Put(":id/members/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("channel.participate")
  @ApiOperation({
    summary:
      "Add a member (self-join for a public channel, or a manager adding anyone)",
  })
  @ApiOkResponse({ type: ConversationResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Conversation or user not found",
  })
  async addMember(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<ConversationResponse> {
    return this.discuss.addMember(actingUserId(request), id, userId);
  }

  @Delete(":id/members/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("channel.participate")
  @ApiOperation({
    summary: "Remove a member (self-leave, or a manager removing anyone)",
  })
  @ApiOkResponse({ type: ConversationResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Conversation not found",
  })
  async removeMember(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ): Promise<ConversationResponse> {
    return this.discuss.removeMember(actingUserId(request), id, userId);
  }

  @Put(":id/read-cursor")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("conversation.read")
  @ApiOperation({ summary: "Mark the conversation read up to a given message" })
  @ApiOkResponse({ description: "Read cursor updated" })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The caller is not a member of this conversation",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Message not found",
  })
  async updateReadCursor(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: UpdateReadCursorDto,
  ): Promise<void> {
    await this.discuss.updateReadCursor(actingUserId(request), id, body);
  }

  @Post(":id/messages")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("message.send")
  @ApiOperation({
    summary: "Post a message, optionally a reply or with mentions",
  })
  @ApiCreatedResponse({ type: MessageResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The caller is not a member of this conversation",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Mentioned user or parent message not found",
  })
  async createMessage(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Body() body: CreateMessageDto,
  ): Promise<MessageResponse> {
    return this.discuss.createMessage(actingUserId(request), id, body);
  }

  @Get(":id/messages")
  @RequirePermissions("conversation.read")
  @ApiOperation({ summary: "List messages, most recent first" })
  @ApiOkResponse({ type: PaginatedMessagesResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The caller is not a member of this conversation",
  })
  async listMessages(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<PaginatedMessagesResponse> {
    return this.discuss.listMessages(actingUserId(request), id, query);
  }

  @Patch(":id/messages/:messageId")
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("message.send")
  @ApiOperation({ summary: "Edit a message's content (author only)" })
  @ApiOkResponse({ type: MessageResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Message not found",
  })
  async updateMessage(
    @Req() request: RequestWithContext,
    @Param("messageId") messageId: string,
    @Body() body: UpdateMessageDto,
  ): Promise<MessageResponse> {
    return this.discuss.updateMessage(actingUserId(request), messageId, body);
  }

  @Delete(":id/messages/:messageId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("message.send")
  @ApiOperation({
    summary: "Soft-delete a message, clearing its content (author only)",
  })
  @ApiOkResponse({ type: MessageResponse })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Message not found",
  })
  async deleteMessage(
    @Req() request: RequestWithContext,
    @Param("messageId") messageId: string,
  ): Promise<MessageResponse> {
    return this.discuss.deleteMessage(actingUserId(request), messageId);
  }

  @Put(":id/messages/:messageId/pin")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("conversation.read")
  @ApiOperation({ summary: "Pin a message (any conversation member)" })
  @ApiOkResponse({ type: MessageResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The caller is not a member of this conversation",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Message not found",
  })
  async pinMessage(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("messageId") messageId: string,
  ): Promise<MessageResponse> {
    return this.discuss.setPin(actingUserId(request), id, messageId, true);
  }

  @Delete(":id/messages/:messageId/pin")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity("csrf-token")
  @RequirePermissions("conversation.read")
  @ApiOperation({ summary: "Unpin a message (any conversation member)" })
  @ApiOkResponse({ type: MessageResponse })
  @ApiConflictResponse({
    type: ProblemDetails,
    description: "The caller is not a member of this conversation",
  })
  @ApiNotFoundResponse({
    type: ProblemDetails,
    description: "Message not found",
  })
  async unpinMessage(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("messageId") messageId: string,
  ): Promise<MessageResponse> {
    return this.discuss.setPin(actingUserId(request), id, messageId, false);
  }
}
