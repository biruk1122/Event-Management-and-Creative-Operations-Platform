import { Injectable } from "@nestjs/common";

import { PartnerStatus, Prisma } from "../../generated/prisma/client.js";
import { DatabaseService } from "../../database/database.service.js";

export interface PartnerFollowUpCandidate {
  id: string;
  followUpAt: Date;
}

@Injectable()
export class PartnersSchedulerRepository {
  constructor(private readonly db: DatabaseService) {}

  async findReminderCandidates(
    asOf: Date,
  ): Promise<PartnerFollowUpCandidate[]> {
    const rows = await this.db.partner.findMany({
      where: {
        status: { notIn: [PartnerStatus.DECLINED, PartnerStatus.COMPLETED] },
        followUpAt: { not: null, lte: asOf },
      },
      select: { id: true, followUpAt: true },
    });
    return rows.map((row) => ({ id: row.id, followUpAt: row.followUpAt! }));
  }

  async tryClaim(
    tx: Prisma.TransactionClient,
    partner: PartnerFollowUpCandidate,
  ): Promise<boolean> {
    try {
      await tx.scheduledOccurrenceClaim.create({
        data: {
          ruleName: "partner.follow_up_due",
          ruleVersion: 1,
          resourceId: partner.id,
          scheduledFor: partner.followUpAt,
        },
        select: { id: true },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return false;
      throw error;
    }
  }
}
