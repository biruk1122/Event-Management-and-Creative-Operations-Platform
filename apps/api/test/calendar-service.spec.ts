import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionScope } from "../src/generated/prisma/client.js";
import type { CalendarEntryRecord } from "../src/calendar/infrastructure/calendar.repository.js";
import { CalendarService } from "../src/calendar/calendar.service.js";

const ACTOR = "00000000-0000-0000-0000-000000000001";
const ENTRY_ID = "00000000-0000-0000-0000-000000000002";

function makeEntry(
  overrides: Partial<CalendarEntryRecord> = {},
): CalendarEntryRecord {
  return {
    id: ENTRY_ID,
    title: "Plan venue visit",
    description: null,
    type: "PERSONAL",
    startAt: new Date("2026-05-01T10:00:00.000Z"),
    endAt: null,
    userId: ACTOR,
    eventId: null,
    taskId: null,
    projectId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: unknown) => {
    expect(
      ((error as HttpException).getResponse() as { code?: string }).code,
    ).toBe(code);
  });
}

describe("CalendarService", () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let permissions: {
    hasGrant: ReturnType<
      typeof vi.fn<
        (
          userId: string,
          key: string,
          scope: PermissionScope,
        ) => Promise<boolean>
      >
    >;
  };
  let service: CalendarService;

  beforeEach(() => {
    repository = {
      list: vi.fn().mockResolvedValue([]),
      findOwned: vi.fn().mockResolvedValue(makeEntry()),
      create: vi.fn().mockResolvedValue(makeEntry()),
      updateOwnedMutable: vi.fn().mockResolvedValue(makeEntry()),
      deleteOwnedMutable: vi.fn().mockResolvedValue(true),
    };
    permissions = { hasGrant: vi.fn().mockResolvedValue(true) };
    service = new CalendarService(repository as never, permissions as never);
  });

  it.each([
    [
      "list",
      "calendar.read",
      (s: CalendarService) =>
        s.list(ACTOR, {
          from: "2026-05-01T00:00:00.000Z",
          to: "2026-05-02T00:00:00.000Z",
        }),
    ],
    ["get", "calendar.read", (s: CalendarService) => s.get(ACTOR, ENTRY_ID)],
    [
      "create",
      "calendar.create",
      (s: CalendarService) =>
        s.create(ACTOR, {
          title: "x",
          type: "PERSONAL",
          startAt: "2026-05-01T00:00:00.000Z",
        }),
    ],
    [
      "update",
      "calendar.update",
      (s: CalendarService) => s.update(ACTOR, ENTRY_ID, {}),
    ],
    [
      "remove",
      "calendar.delete",
      (s: CalendarService) => s.remove(ACTOR, ENTRY_ID),
    ],
  ] as const)("%s requires %s at SELF scope", async (_label, key, call) => {
    permissions.hasGrant.mockResolvedValue(false);
    await expectCode(call(service), "PERMISSION_DENIED");
    expect(permissions.hasGrant).toHaveBeenCalledWith(ACTOR, key, "SELF");
  });

  it("accepts a 90-day range and rejects an inverted or longer range", async () => {
    await expect(
      service.list(ACTOR, {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-04-01T00:00:00.000Z",
      }),
    ).resolves.toEqual({ items: [] });
    await expectCode(
      service.list(ACTOR, {
        from: "2026-04-01T00:00:00.000Z",
        to: "2026-01-01T00:00:00.000Z",
      }),
      "CALENDAR_RANGE_INVALID",
    );
    await expectCode(
      service.list(ACTOR, {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-04-02T00:00:00.000Z",
      }),
      "CALENDAR_RANGE_INVALID",
    );
  });

  it("creates only the calendar-owned types and rejects an end before the start", async () => {
    await expectCode(
      service.create(ACTOR, {
        title: "x",
        type: "REMINDER",
        startAt: "2026-05-02T00:00:00.000Z",
        endAt: "2026-05-01T00:00:00.000Z",
      }),
      "CALENDAR_SCHEDULE_INVALID",
    );
    expect(repository.create).not.toHaveBeenCalled();

    await service.create(ACTOR, {
      title: " Reminder ",
      type: "REMINDER",
      startAt: "2026-05-01T00:00:00.000Z",
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Reminder", type: "REMINDER" }),
    );
  });

  it("does not allow a source projection to be updated or deleted", async () => {
    repository.findOwned!.mockResolvedValue(makeEntry({ type: "EVENT" }));
    await expectCode(
      service.update(ACTOR, ENTRY_ID, { title: "new" }),
      "CALENDAR_ENTRY_NOT_FOUND",
    );
    expect(repository.updateOwnedMutable).not.toHaveBeenCalled();

    repository.deleteOwnedMutable!.mockResolvedValue(false);
    await expectCode(
      service.remove(ACTOR, ENTRY_ID),
      "CALENDAR_ENTRY_NOT_FOUND",
    );
    expect(repository.deleteOwnedMutable).toHaveBeenCalledWith(ENTRY_ID, ACTOR);
  });

  it("maps an entry owned by another user to the stable not-found response", async () => {
    repository.findOwned!.mockResolvedValue(null);
    await expectCode(service.get(ACTOR, ENTRY_ID), "CALENDAR_ENTRY_NOT_FOUND");
  });
});
