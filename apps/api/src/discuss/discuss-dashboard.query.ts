import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  sourceScope,
  type ReadContext,
  type ReadWindow,
} from "../common/queries/operational-read.js";
import type { OperationalItem } from "../common/queries/operational-read.js";
@Injectable()
export class DiscussDashboardQuery {
  constructor(private readonly db: DatabaseService) {}
  async unread(ctx: ReadContext, w: ReadWindow) {
    sourceScope(ctx, "conversation.read", ["organization", "self"]);
    const [data] = await this.db.readModel<{
      count: number;
      totalConversations: number;
      items: Array<{ conversationId: string; count: number }>;
      hasMore: boolean;
    }>(Prisma.sql`
      WITH counts AS (
        SELECT cm.conversation_id AS "conversationId",count(*)::int AS count
        FROM conversation_members cm JOIN messages m ON m.conversation_id=cm.conversation_id
        LEFT JOIN messages cursor ON cursor.id=cm.last_read_message_id AND cursor.conversation_id=cm.conversation_id
        WHERE cm.user_id=${ctx.userId}::uuid AND m.deleted_at IS NULL AND m.author_id IS DISTINCT FROM ${ctx.userId}::uuid
        AND (cursor.id IS NOT NULL AND (m.created_at,m.id) > (cursor.created_at,cursor.id)
          OR cursor.id IS NULL AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at))
        GROUP BY cm.conversation_id),
      selected AS (SELECT * FROM counts ORDER BY count DESC,"conversationId" LIMIT ${w.limit})
      SELECT coalesce(sum(count),0)::int AS count,count(*)::int AS "totalConversations",
        count(*) > ${w.limit} AS "hasMore",
        coalesce((SELECT jsonb_agg(selected ORDER BY count DESC,"conversationId") FROM selected),'[]'::jsonb) AS items FROM counts`);
    return { scope: "self" as const, data: data! };
  }
  async channels(ctx: ReadContext, w: ReadWindow) {
    sourceScope(ctx, "conversation.read", ["organization", "self"]);
    const [data] = await this.db.readModel<{
      count: number;
      items: OperationalItem[];
      hasMore: boolean;
    }>(Prisma.sql`
      WITH visible AS (
        SELECT c.id,c.name FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id
        WHERE cm.user_id=${ctx.userId}::uuid AND c.type='CHANNEL'),
      selected AS (SELECT * FROM visible ORDER BY name,id LIMIT ${w.limit})
      SELECT (SELECT count(*)::int FROM visible) AS count,(SELECT count(*) > ${w.limit} FROM visible) AS "hasMore",
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',name,'kind','CHANNEL') ORDER BY name,id) FROM selected),'[]'::jsonb) AS items`);
    return { scope: "self" as const, data: data! };
  }
}
