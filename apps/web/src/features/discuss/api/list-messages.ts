import type { PaginatedMessages } from "../lib/discuss-types";
import { FIXTURE_MESSAGES } from "./fixtures";

export interface ListMessagesQuery {
  search?: string;
  page?: number;
}

/** Placeholder for `GET /api/v1/conversations/:id/messages` - see DSC-05. */
export type ListMessages = (
  conversationId: string,
  query: ListMessagesQuery,
) => Promise<PaginatedMessages>;

export const listMessages: ListMessages = (conversationId, query) => {
  const term = query.search?.trim().toLowerCase() ?? "";
  const all = FIXTURE_MESSAGES[conversationId] ?? [];
  const items = term
    ? all.filter((message) => message.content.toLowerCase().includes(term))
    : all;
  return Promise.resolve({
    items: [...items].reverse(),
    page: query.page ?? 1,
    pageSize: 50,
    total: items.length,
  });
};
