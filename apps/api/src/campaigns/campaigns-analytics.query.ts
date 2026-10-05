import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import {
  creationCounts,
  idPage,
  uuidSet,
  type ProgressCounts,
  type ReadPage,
  type ReadPeriod,
} from "../database/read-models.js";
import { Prisma, type CampaignType } from "../generated/prisma/client.js";

@Injectable()
export class CampaignsAnalyticsQuery {
  constructor(private readonly db: DatabaseService) {}
  page(page: ReadPage, type: CampaignType, id?: string) {
    return idPage(
      this.db,
      Prisma.sql`campaigns`,
      Prisma.sql`id`,
      Prisma.sql`campaign_type = ${type}::campaign_type AND ${id ? Prisma.sql`id = ${id}::uuid` : Prisma.sql`true`}`,
      page,
    );
  }
  async progress(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.db.readModel<
      ProgressCounts & { id: string }
    >(Prisma.sql`
      SELECT campaign_id AS id, count(*)::int AS total,
        count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        round(100.0 * count(*) FILTER (WHERE status = 'COMPLETED') / nullif(count(*), 0))::int AS percent
      FROM campaign_activities WHERE campaign_id IN (${uuidSet(ids)}) AND status <> 'CANCELLED' GROUP BY campaign_id`);
    return ids.map(
      (id) =>
        rows.find((row) => row.id === id) ?? {
          id,
          total: 0,
          completed: 0,
          percent: null,
        },
    );
  }
  /** Used by Promotion without exposing Campaigns' repository or status table. */
  async activityProgress(
    campaignId: string,
    ids: string[],
  ): Promise<ProgressCounts> {
    const [row] = await this.db.readModel<ProgressCounts>(Prisma.sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        round(100.0 * count(*) FILTER (WHERE status = 'COMPLETED') / nullif(count(*), 0))::int AS percent
      FROM campaign_activities WHERE campaign_id = ${campaignId}::uuid AND id IN (${uuidSet(ids)}) AND status <> 'CANCELLED'`);
    return row!;
  }
  creation(period: ReadPeriod) {
    return creationCounts(this.db, Prisma.sql`campaigns`, period);
  }
}
