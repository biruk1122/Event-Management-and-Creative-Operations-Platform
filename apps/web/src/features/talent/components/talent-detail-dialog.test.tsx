import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The dialog default-imports getTalent from the gateway, which pulls in the
// real browser API client and validates public env vars at import time. Every
// test here injects its own reader, so a stub client keeps that import chain
// from throwing.
vi.mock("@/lib/api/browser", () => ({ browserApi: {} }));

import { ALL_ABILITIES, EVENTS, USERS, makeTalent } from "../test-data";
import { TalentDetailDialog } from "./talent-detail-dialog";
import type { Talent } from "../lib/talent-types";

function renderDialog(
  overrides: Partial<Parameters<typeof TalentDetailDialog>[0]> = {},
) {
  const props = {
    talentId: "tal-1" as string | null,
    onOpenChange: vi.fn(),
    users: USERS,
    events: EVENTS,
    abilities: ALL_ABILITIES,
    getTalent: vi.fn((): Promise<Talent | null> =>
      Promise.resolve(makeTalent()),
    ),
    onUpdate: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        talent: makeTalent({ fullName: "Renamed" }),
      }),
    ),
    onTransition: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        talent: makeTalent({ availability: "ASSIGNED" }),
      }),
    ),
    onSetManager: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        talent: makeTalent({ manager: USERS[0]! }),
      }),
    ),
    onAddSocialLink: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        talent: makeTalent({
          socialLinks: [
            { id: "sl1", label: "Instagram", url: "https://instagram.com/a" },
          ],
        }),
      }),
    ),
    onRemoveSocialLink: vi.fn(() =>
      Promise.resolve({ status: "success" as const }),
    ),
    onAddSchedule: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        talent: makeTalent({
          schedules: [
            {
              id: "sch1",
              title: "Sound check",
              startAt: "2026-06-01T10:00:00.000Z",
              endAt: "2026-06-01T11:00:00.000Z",
            },
          ],
        }),
      }),
    ),
    onUpdateSchedule: vi.fn(() =>
      Promise.resolve({ status: "success" as const, talent: makeTalent() }),
    ),
    onRemoveSchedule: vi.fn(() =>
      Promise.resolve({ status: "success" as const }),
    ),
    onAssignEvent: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        talent: makeTalent({
          eventAssignments: [
            {
              id: "asg1",
              event: { id: "e1", name: "Aurora Premiere" },
              role: "Headliner",
              status: "ASSIGNED",
              assignedAt: "2026-05-01T00:00:00.000Z",
              updatedAt: "2026-05-01T00:00:00.000Z",
            },
          ],
        }),
      }),
    ),
    onTransitionAssignment: vi.fn(() =>
      Promise.resolve({
        status: "success" as const,
        talent: makeTalent({
          eventAssignments: [
            {
              id: "asg1",
              event: { id: "e1", name: "Aurora Premiere" },
              role: "Headliner",
              status: "COMPLETED",
              assignedAt: "2026-05-01T00:00:00.000Z",
              updatedAt: "2026-05-02T00:00:00.000Z",
            },
          ],
        }),
      }),
    ),
    onChanged: vi.fn(),
    ...overrides,
  };
  render(<TalentDetailDialog {...props} />);
  return props;
}

async function waitForLoaded(name = "Amina Tesfaye") {
  return within(await screen.findByRole("dialog")).findByRole("heading", {
    name,
  });
}

describe("TalentDetailDialog", () => {
  describe("loading", () => {
    it("announces loading first", () => {
      renderDialog({
        getTalent: vi.fn(() => new Promise<Talent | null>(() => undefined)),
      });

      expect(screen.getByText("Loading talent…")).toBeVisible();
    });

    it("loads the talent and shows its details and manager", async () => {
      renderDialog({
        getTalent: vi.fn(() =>
          Promise.resolve(makeTalent({ manager: USERS[0]! })),
        ),
      });
      await waitForLoaded();

      expect(screen.getByLabelText("Full name")).toHaveValue("Amina Tesfaye");
      expect(screen.getByLabelText("Email")).toHaveValue("amina@example.com");
      expect(screen.getByText("Managed by Morgan Lead")).toBeVisible();
    });

    it("shows an error state when the talent cannot be loaded", async () => {
      renderDialog({ getTalent: vi.fn(() => Promise.resolve(null)) });

      expect(
        await screen.findByText("We could not load this talent"),
      ).toBeVisible();
    });
  });

  describe("details", () => {
    it("saves edited profile fields", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn(() =>
        Promise.resolve({
          status: "success" as const,
          talent: makeTalent({ fullName: "Renamed Talent" }),
        }),
      );
      renderDialog({ onUpdate });
      await waitForLoaded();

      const nameField = screen.getByLabelText("Full name");
      await user.clear(nameField);
      await user.type(nameField, "Renamed Talent");
      await user.click(screen.getByRole("button", { name: "Save details" }));

      await waitFor(() =>
        expect(onUpdate).toHaveBeenCalledWith(
          "tal-1",
          expect.objectContaining({ fullName: "Renamed Talent" }),
        ),
      );
      expect(await screen.findByLabelText("Full name")).toHaveValue(
        "Renamed Talent",
      );
    });

    it("read-only caller cannot edit, sees an explanatory note", async () => {
      renderDialog({ abilities: { ...ALL_ABILITIES, canUpdate: false } });
      await waitForLoaded();

      expect(screen.getByLabelText("Full name")).toBeDisabled();
      expect(
        screen.getByText("You have read-only access to this talent’s details."),
      ).toBeVisible();
    });
  });

  describe("availability", () => {
    it("moves to an offered state", async () => {
      const user = userEvent.setup();
      const onTransition = vi.fn(() =>
        Promise.resolve({
          status: "success" as const,
          talent: makeTalent({ availability: "ASSIGNED" }),
        }),
      );
      renderDialog({ onTransition });
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: /Move to/ }));
      await user.click(await screen.findByRole("option", { name: "Assigned" }));

      await waitFor(() =>
        expect(onTransition).toHaveBeenCalledWith("tal-1", "ASSIGNED"),
      );
    });

    it("shows a terminal-state message and no control when inactive", async () => {
      renderDialog({
        getTalent: vi.fn(() =>
          Promise.resolve(makeTalent({ availability: "INACTIVE" })),
        ),
      });
      await waitForLoaded();

      expect(screen.getByText("Inactive is a final state.")).toBeVisible();
      expect(
        screen.queryByRole("combobox", { name: /Move to/ }),
      ).not.toBeInTheDocument();
    });

    it("shows the invalid-transition error", async () => {
      const user = userEvent.setup();
      renderDialog({
        onTransition: vi.fn(() =>
          Promise.resolve({ status: "invalid_transition" as const }),
        ),
      });
      await waitForLoaded();

      await user.click(screen.getByRole("combobox", { name: /Move to/ }));
      await user.click(await screen.findByRole("option", { name: "Assigned" }));

      expect(
        await screen.findByText(
          "That move is not allowed from the current availability.",
        ),
      ).toBeVisible();
    });
  });

  describe("manager", () => {
    it("assigns and clears the manager", async () => {
      const user = userEvent.setup();
      const onSetManager = vi.fn(() =>
        Promise.resolve({
          status: "success" as const,
          talent: makeTalent({ manager: USERS[0]! }),
        }),
      );
      renderDialog({ onSetManager });
      await waitForLoaded();

      const [managerSelect] = screen.getAllByRole("combobox", {
        name: "Manager",
      });
      await user.click(managerSelect!);
      await user.click(
        await screen.findByRole("option", { name: "Morgan Lead" }),
      );

      await waitFor(() =>
        expect(onSetManager).toHaveBeenCalledWith("tal-1", "u1"),
      );
    });
  });

  describe("schedules", () => {
    it("adds a schedule entry", async () => {
      const user = userEvent.setup();
      const onAddSchedule = vi.fn(() =>
        Promise.resolve({
          status: "success" as const,
          talent: makeTalent({
            schedules: [
              {
                id: "sch1",
                title: "Sound check",
                startAt: "2026-06-01T10:00:00.000Z",
                endAt: "2026-06-01T11:00:00.000Z",
              },
            ],
          }),
        }),
      );
      renderDialog({ onAddSchedule });
      await waitForLoaded();

      await user.click(
        screen.getByRole("button", { name: "Add schedule entry" }),
      );
      await user.type(screen.getByLabelText("Title"), "Sound check");
      await user.type(
        screen.getByLabelText("Starts (UTC)"),
        "2026-06-01T10:00",
      );
      await user.type(screen.getByLabelText("Ends (UTC)"), "2026-06-01T11:00");
      await user.click(screen.getByRole("button", { name: "Add entry" }));

      await waitFor(() => expect(onAddSchedule).toHaveBeenCalled());
      expect(await screen.findByText("Sound check")).toBeVisible();
    });

    // DELETE .../schedules/:id returns no body, so the row must be dropped
    // from the already-loaded talent locally rather than via `onChanged`.
    it("removes a schedule entry and drops it from the list", async () => {
      const user = userEvent.setup();
      const onRemoveSchedule = vi.fn(() =>
        Promise.resolve({ status: "success" as const }),
      );
      renderDialog({
        getTalent: vi.fn(() =>
          Promise.resolve(
            makeTalent({
              schedules: [
                {
                  id: "sch1",
                  title: "Sound check",
                  startAt: "2026-06-01T10:00:00.000Z",
                  endAt: "2026-06-01T11:00:00.000Z",
                },
              ],
            }),
          ),
        ),
        onRemoveSchedule,
      });
      await waitForLoaded();
      expect(screen.getByText("Sound check")).toBeVisible();

      await user.click(
        screen.getByRole("button", { name: "Remove Sound check" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Confirm remove Sound check" }),
      );

      await waitFor(() =>
        expect(onRemoveSchedule).toHaveBeenCalledWith("tal-1", "sch1"),
      );
      expect(screen.queryByText("Sound check")).not.toBeInTheDocument();
    });
  });

  describe("social links", () => {
    it("adds a social link and reports a duplicate url as a conflict", async () => {
      const user = userEvent.setup();
      const onAddSocialLink = vi
        .fn()
        .mockResolvedValueOnce({ status: "conflict" as const });
      renderDialog({ onAddSocialLink });
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Add social link" }));
      await user.type(screen.getByLabelText("Label"), "Instagram");
      await user.type(screen.getByLabelText("URL"), "https://instagram.com/a");
      await user.click(screen.getByRole("button", { name: "Add link" }));

      expect(
        await screen.findByText(
          "That URL is already recorded for this talent.",
        ),
      ).toBeVisible();
    });

    // DELETE .../social-links/:id returns no body, so the row must be dropped
    // from the already-loaded talent locally rather than via `onChanged`.
    it("removes a social link and drops it from the list", async () => {
      const user = userEvent.setup();
      const onRemoveSocialLink = vi.fn(() =>
        Promise.resolve({ status: "success" as const }),
      );
      renderDialog({
        getTalent: vi.fn(() =>
          Promise.resolve(
            makeTalent({
              socialLinks: [
                {
                  id: "sl1",
                  label: "Instagram",
                  url: "https://instagram.com/a",
                },
              ],
            }),
          ),
        ),
        onRemoveSocialLink,
      });
      await waitForLoaded();
      expect(screen.getByText("Instagram")).toBeVisible();

      await user.click(
        screen.getByRole("button", { name: "Remove Instagram" }),
      );

      await waitFor(() =>
        expect(onRemoveSocialLink).toHaveBeenCalledWith("tal-1", "sl1"),
      );
      expect(screen.queryByText("Instagram")).not.toBeInTheDocument();
    });
  });

  describe("event assignments", () => {
    it("assigns to an event and transitions its status", async () => {
      const user = userEvent.setup();
      const onAssignEvent = vi.fn(() =>
        Promise.resolve({
          status: "success" as const,
          talent: makeTalent({
            eventAssignments: [
              {
                id: "asg1",
                event: { id: "e1", name: "Aurora Premiere" },
                role: "Headliner",
                status: "ASSIGNED",
                assignedAt: "2026-05-01T00:00:00.000Z",
                updatedAt: "2026-05-01T00:00:00.000Z",
              },
            ],
          }),
        }),
      );
      renderDialog({ onAssignEvent });
      await waitForLoaded();

      await user.click(
        screen.getByRole("button", { name: "Assign to an event" }),
      );
      await user.click(screen.getByRole("combobox", { name: "Event" }));
      await user.click(
        await screen.findByRole("option", { name: "Aurora Premiere" }),
      );
      await user.type(screen.getByLabelText("Role"), "Headliner");
      await user.click(screen.getByRole("button", { name: "Assign" }));

      await waitFor(() => expect(onAssignEvent).toHaveBeenCalled());
      expect(await screen.findByText("Aurora Premiere")).toBeVisible();
    });
  });
});
