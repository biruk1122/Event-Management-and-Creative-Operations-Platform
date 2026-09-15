import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";

export const DISCUSS_ERROR = {
  conversationNotFound: "CONVERSATION_NOT_FOUND",
  messageNotFound: "MESSAGE_NOT_FOUND",
  userNotFound: "DISCUSS_USER_NOT_FOUND",
  workspaceNotFound: "DISCUSS_WORKSPACE_NOT_FOUND",
  departmentNotFound: "DISCUSS_DEPARTMENT_NOT_FOUND",
  teamNotFound: "DISCUSS_TEAM_NOT_FOUND",
  ownerInvalid: "CHANNEL_OWNER_INVALID",
  directMemberCount: "DIRECT_CONVERSATION_MEMBER_COUNT",
  notMember: "CONVERSATION_NOT_MEMBER",
  parentNotFound: "MESSAGE_PARENT_NOT_FOUND",
} as const;

export function conversationNotFound(): HttpException {
  return new NotFoundException({
    code: DISCUSS_ERROR.conversationNotFound,
    error: "Not Found",
    detail: "No conversation exists with that id.",
  });
}

export function messageNotFound(): HttpException {
  return new NotFoundException({
    code: DISCUSS_ERROR.messageNotFound,
    error: "Not Found",
    detail: "No message exists with that id.",
  });
}

export function discussUserNotFound(): HttpException {
  return new NotFoundException({
    code: DISCUSS_ERROR.userNotFound,
    error: "Not Found",
    detail: "No user exists with that id.",
  });
}

export function discussWorkspaceNotFound(): HttpException {
  return new NotFoundException({
    code: DISCUSS_ERROR.workspaceNotFound,
    error: "Not Found",
    detail: "No workspace exists with that id.",
  });
}

export function discussDepartmentNotFound(): HttpException {
  return new NotFoundException({
    code: DISCUSS_ERROR.departmentNotFound,
    error: "Not Found",
    detail: "No department exists with that id.",
  });
}

export function discussTeamNotFound(): HttpException {
  return new NotFoundException({
    code: DISCUSS_ERROR.teamNotFound,
    error: "Not Found",
    detail: "No team exists with that id.",
  });
}

export function channelOwnerInvalid(): HttpException {
  return new BadRequestException({
    code: DISCUSS_ERROR.ownerInvalid,
    error: "Bad Request",
    detail:
      "A channel may have at most one owner: a workspace, a department, or a team.",
  });
}

export function directConversationMemberCount(): HttpException {
  return new BadRequestException({
    code: DISCUSS_ERROR.directMemberCount,
    error: "Bad Request",
    detail: "A direct conversation must name exactly one other member.",
  });
}

export function conversationNotMember(): HttpException {
  return new ConflictException({
    code: DISCUSS_ERROR.notMember,
    error: "Conflict",
    detail: "Only a member of this conversation can do that.",
  });
}

export function messageParentNotFound(): HttpException {
  return new NotFoundException({
    code: DISCUSS_ERROR.parentNotFound,
    error: "Not Found",
    detail: "The message being replied to does not exist in this conversation.",
  });
}
