import type { components } from "@event-platform/api-client";

export type Conversation = components["schemas"]["ConversationResponse"];
export type ConversationMember =
  components["schemas"]["ConversationMemberResponse"];
export type Message = components["schemas"]["MessageResponse"];
export type DiscussPerson = components["schemas"]["DiscussPersonSummary"];
export type PaginatedConversations =
  components["schemas"]["PaginatedConversationsResponse"];
export type PaginatedMessages =
  components["schemas"]["PaginatedMessagesResponse"];

export type ConversationType = Conversation["type"];
export type ChannelVisibility = NonNullable<Conversation["visibility"]>;

/** A general-purpose channel names no owner; only one of the three may be
 * set. Mirrors `CreateChannelDto`. */
export type ChannelOwner =
  | { kind: "GENERAL" }
  | { kind: "WORKSPACE"; workspaceId: string; workspaceName: string }
  | { kind: "DEPARTMENT"; departmentId: string; departmentName: string }
  | { kind: "TEAM"; teamId: string; teamName: string };

/** The person's name, or their email when no name is on file. */
export function personName(
  person: Pick<DiscussPerson, "firstName" | "lastName" | "email">,
): string {
  const parts = [person.firstName, person.lastName].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" ") : person.email;
}

/** The conversation's display name: a channel's own name, or the other
 * member(s)' names for a direct/group conversation. */
export function conversationTitle(
  conversation: Pick<Conversation, "type" | "name" | "members">,
  viewerId: string,
): string {
  if (conversation.type === "CHANNEL") {
    return conversation.name ?? "Untitled channel";
  }
  const others = conversation.members.filter(
    (member) => member.id !== viewerId,
  );
  if (others.length === 0) return "Just you";
  return others.map(personName).join(", ");
}

/** Whether the conversation has activity since the viewer's own member row
 * last read it - `updatedAt` is a proxy for "a message changed" since the
 * list response does not include the latest message. */
export function isUnread(
  conversation: Pick<Conversation, "updatedAt">,
  viewerMember: Pick<ConversationMember, "lastReadAt">,
): boolean {
  if (viewerMember.lastReadAt === null) return true;
  return new Date(conversation.updatedAt) > new Date(viewerMember.lastReadAt);
}

/** A short, human timestamp: time-of-day for today, otherwise a short date.
 * Renders in the viewer's locale. */
export function formatActivityTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
