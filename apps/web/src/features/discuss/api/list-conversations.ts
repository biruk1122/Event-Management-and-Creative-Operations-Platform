import type {
  ConversationType,
  PaginatedConversations,
} from "../lib/discuss-types";
import { FIXTURE_CONVERSATIONS } from "./fixtures";

export interface ListConversationsQuery {
  type?: ConversationType | readonly ConversationType[];
  search?: string;
  page?: number;
}

export type ListConversations = (
  query: ListConversationsQuery,
) => Promise<PaginatedConversations>;

function matchesType(
  type: ConversationType,
  filter: ConversationType | readonly ConversationType[] | undefined,
): boolean {
  if (!filter) return true;
  return Array.isArray(filter) ? filter.includes(type) : filter === type;
}

/**
 * Placeholder for `GET /api/v1/conversations`. DSC-05 (EVE-109) replaces the
 * body with a real `@event-platform/api-client` call and TanStack Query
 * wiring. Filters the canned set so the list screens can be built and tested
 * against realistic data.
 */
export const listConversations: ListConversations = (query) => {
  const term = query.search?.trim().toLowerCase() ?? "";
  const items = FIXTURE_CONVERSATIONS.filter((conversation) => {
    if (!matchesType(conversation.type, query.type)) return false;
    if (term === "") return true;
    return (conversation.name ?? "").toLowerCase().includes(term);
  });
  return Promise.resolve({
    items,
    page: query.page ?? 1,
    pageSize: 25,
    total: items.length,
  });
};
