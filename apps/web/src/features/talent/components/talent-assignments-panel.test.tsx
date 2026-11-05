import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { TalentAssignmentsPanel } from "./talent-assignments-panel";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/api/browser", () => ({
  browserApi: {
    GET: get,
    POST: post,
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

const ACCESS = {
  userId: "operator-1",
  grants: [{ permissionKey: "talent.assign", scope: "ORGANIZATION" }],
} as CurrentAccess;

const ACTIVE = {
  id: "asg-1",
  kind: "EVENT",
  workId: "ev-1",
  workName: "Aurora Premiere",
  role: "Headliner",
  notes: null,
  status: "ASSIGNED",
  phase: "upcoming",
  startAt: null,
  endAt: null,
  departmentId: null,
  assignedAt: "2026-05-01T00:00:00.000Z",
  assignedBy: null,
  completedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onChanged = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <TalentAssignmentsPanel
        access={ACCESS}
        talentId="tal-1"
        talentName="Amina Tesfaye"
        canAssign
        assignOpen={false}
        onAssignOpenChange={vi.fn()}
        onChanged={onChanged}
      />
    </QueryClientProvider>,
  );
  return { onChanged };
}

describe("TalentAssignmentsPanel", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockImplementation(async () => ({
      data: [ACTIVE],
      response: { ok: true, status: 200 },
    }));
    post.mockImplementation(async () => ({
      data: { ...ACTIVE, status: "COMPLETED", phase: "completed" },
      response: { ok: true, status: 200 },
    }));
  });

  it("asks for a reason before an assignment can be cancelled", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Cancel assignment" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel assignment" }),
    );

    expect(
      await within(dialog).findByText(
        "Say why the assignment is being cancelled.",
      ),
    ).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("marks an active assignment complete and reports the change", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Mark complete" }),
    );

    expect(
      await screen.findByText("Assignment marked complete."),
    ).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      "/api/v1/talents/{talentId}/assignments/{kind}/{assignmentId}/transition",
      expect.objectContaining({
        body: { status: "COMPLETED" },
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("hides the change controls from a caller who cannot assign", async () => {
    get.mockImplementation(async () => ({
      data: [ACTIVE],
      response: { ok: true, status: 200 },
    }));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <TalentAssignmentsPanel
          access={ACCESS}
          talentId="tal-1"
          talentName="Amina Tesfaye"
          canAssign={false}
          assignOpen={false}
          onAssignOpenChange={vi.fn()}
          onChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Aurora Premiere")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark complete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign to work" })).toBeNull();
  });
});
