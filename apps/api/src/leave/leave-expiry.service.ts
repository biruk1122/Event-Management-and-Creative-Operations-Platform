import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { LeaveRepository } from "./infrastructure/leave.repository.js";

const SCAN_INTERVAL_MS = 60_000;

/**
 * The daily (in practice, every-minute-checked) job that expires a leave
 * grant's unconsumed remainder once its own two-year window has passed.
 * There is no automatic accrual in this version - this job only ever
 * subtracts a remainder that HR already granted and the employee never
 * used; it never creates new entitlement. Retried or overlapping ticks are
 * safe: `LeaveRepository.expireGrant` is idempotent per grant via the
 * database's own partial unique index.
 */
@Injectable()
export class LeaveExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaveExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private readonly repository: LeaveRepository) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), SCAN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const asOf = new Date();
      const grants = await this.repository.findExpiringGrants(asOf);
      for (const grant of grants) {
        await this.repository.expireGrant({
          grantId: grant.id,
          employeeId: grant.employeeId,
          leaveTypeId: grant.leaveTypeId,
          amountDays: grant.remaining,
        });
      }
    } catch (error) {
      this.logger.error(
        `leave expiry tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
