import { beforeEach, describe, expect, it, vi } from "vitest";

import { LeaveExpiryService } from "../src/leave/leave-expiry.service.js";

interface Tickable {
  tick: () => Promise<void>;
}

describe("LeaveExpiryService", () => {
  let repository: {
    findExpiringGrants: ReturnType<typeof vi.fn>;
    expireGrant: ReturnType<typeof vi.fn>;
  };
  let service: LeaveExpiryService;

  beforeEach(() => {
    repository = {
      findExpiringGrants: vi.fn().mockResolvedValue([]),
      expireGrant: vi.fn().mockResolvedValue("expired"),
    };
    service = new LeaveExpiryService(repository as never);
  });

  function tick(): Promise<void> {
    return (service as unknown as Tickable).tick();
  }

  it("expires every candidate grant returned for this tick", async () => {
    repository.findExpiringGrants.mockResolvedValue([
      {
        id: "grant-1",
        employeeId: "emp-1",
        leaveTypeId: "type-1",
        remaining: 4,
      },
      {
        id: "grant-2",
        employeeId: "emp-2",
        leaveTypeId: "type-1",
        remaining: 2,
      },
    ]);
    await tick();
    expect(repository.expireGrant).toHaveBeenCalledTimes(2);
    expect(repository.expireGrant).toHaveBeenCalledWith({
      grantId: "grant-1",
      employeeId: "emp-1",
      leaveTypeId: "type-1",
      amountDays: 4,
    });
  });

  it("does nothing when there are no expiring grants", async () => {
    await tick();
    expect(repository.expireGrant).not.toHaveBeenCalled();
  });

  it("guards against overlapping ticks via the reentrancy flag", async () => {
    let resolveFind!: () => void;
    repository.findExpiringGrants.mockReturnValue(
      new Promise((resolve) => {
        resolveFind = () => resolve([]);
      }),
    );

    const first = tick();
    const second = tick();
    resolveFind();
    await Promise.all([first, second]);

    expect(repository.findExpiringGrants).toHaveBeenCalledTimes(1);
  });

  it("logs and swallows a failure instead of throwing out of the tick", async () => {
    repository.findExpiringGrants.mockRejectedValue(
      new Error("db unavailable"),
    );
    await expect(tick()).resolves.toBeUndefined();
  });
});
