import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../../../database/database.service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

export interface KioskRecord {
  id: string;
  name: string;
  locationLabel: string;
  isActive: boolean;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface KioskAuthRecord extends KioskRecord {
  tokenHash: string;
}

export interface KioskEmployeeOptionRecord {
  id: string;
  name: string;
}

const KIOSK_SELECT = {
  id: true,
  name: true,
  locationLabel: true,
  isActive: true,
  createdAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class KioskRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: {
    name: string;
    locationLabel: string;
    tokenHash: string;
    createdById: string;
  }): Promise<KioskRecord> {
    return this.db.attendanceKiosk.create({
      data: {
        name: input.name,
        locationLabel: input.locationLabel,
        tokenHash: input.tokenHash,
        createdById: input.createdById,
      },
      select: KIOSK_SELECT,
    });
  }

  async list(): Promise<KioskRecord[]> {
    return this.db.attendanceKiosk.findMany({
      select: KIOSK_SELECT,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
  }

  async findById(id: string): Promise<KioskRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.attendanceKiosk.findUnique({
      where: { id },
      select: KIOSK_SELECT,
    });
  }

  /** Includes the token hash - used only by the kiosk-token guard's own
   * constant-time comparison, never returned in any API response. */
  async findAuthById(id: string): Promise<KioskAuthRecord | null> {
    if (!isUuid(id)) return null;
    return this.db.attendanceKiosk.findFirst({
      where: { id, isActive: true, revokedAt: null },
      select: { ...KIOSK_SELECT, tokenHash: true },
    });
  }

  async revoke(
    id: string,
    revokedById: string,
  ): Promise<"not_found" | "revoked"> {
    if (!isUuid(id)) return "not_found";
    const result = await this.db.attendanceKiosk.updateMany({
      where: { id, revokedAt: null },
      data: { isActive: false, revokedAt: new Date(), revokedById },
    });
    return result.count === 1 ? "revoked" : "not_found";
  }

  /** Display name only - never used to confirm identity by itself. */
  async getEmployeeName(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!user) return null;
    const name = [user.firstName, user.lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    return name.length > 0 ? name : user.email;
  }

  /** The employment-status half of kiosk eligibility - `User.status` alone
   * (checked by `AuthService.verifyAccountPassword`) is the account's own
   * standing, not the employee record's. Both must be active. */
  async isActiveEmployee(userId: string): Promise<boolean> {
    if (!isUuid(userId)) return false;
    const count = await this.db.employeeProfile.count({
      where: { userId, employmentStatus: "ACTIVE" },
    });
    return count === 1;
  }

  /** Active employees only, matching name or employee code - deliberately
   * returns nothing but an id and a display name (EMP-02's "no unnecessary
   * employee information in kiosk responses" rule). */
  async searchEmployees(
    search: string | undefined,
    limit: number,
  ): Promise<KioskEmployeeOptionRecord[]> {
    const rows = await this.db.user.findMany({
      where: {
        status: "ACTIVE",
        employeeProfile: { employmentStatus: "ACTIVE" },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                {
                  employeeProfile: {
                    employeeCode: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      name:
        [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
    }));
  }
}
