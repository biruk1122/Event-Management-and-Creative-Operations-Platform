import { Module } from "@nestjs/common";

import { AttendanceRepository } from "./infrastructure/attendance.repository.js";

/**
 * The shared attendance core (punches + sessions) - owns no controllers of
 * its own. The kiosk and mobile-event submodules each own their own
 * authentication/authorization and call into `AttendanceRepository` for
 * the actual check-in/check-out recording, so "no duplicate check-in" and
 * "no check-out without a check-in" are enforced exactly once, not
 * re-implemented per entry point.
 */
@Module({
  providers: [AttendanceRepository],
  exports: [AttendanceRepository],
})
export class AttendanceModule {}
