import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { AssignTalentDialog } from "./assign-talent-dialog";

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

const ok = (data: unknown) => ({ data, response: { ok: true, status: 200 } });

const ACCESS = {
  userId: "operator-1",
  grants: [{ permissionKey: "talent.assign", scope: "ORGANIZATION" }],
} as CurrentAccess;

const AURORA = {
  id: "ev-1",
  kind: "EVENT",
  name: "Aurora Premiere",
  startAt: "2026-06-01T10:00:00.000Z",
  endAt: "2026-06-01T12:00:00.000Z",
  departmentId: null,
};

function renderDialog(
  overrides: Partial<Parameters<typeof AssignTalentDialog>[0]> = {},
) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AssignTalentDialog
        open
        onOpenChange={onOpenChange}
        access={ACCESS}
        talentId="tal-1"
        talentName="Amina Tesfaye"
        onSaved={onSaved}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onSaved, onOpenChange };
}

async function chooseWorkAndRole(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("combobox", { name: /Related work/ }),
  );
  await user.click(
    await screen.findByRole("option", { name: "Aurora Premiere" }),
  );
  await user.type(screen.getByLabelText("Role"), "Headliner");
}

describe("AssignTalentDialog", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockImplementation(async (path: string) => {
      if (path === "/api/v1/talent-assignments/works") return ok([AURORA]);
      return { data: undefined, response: { ok: false, status: 404 } };
    });
  });

  it("shows the window's conflicts and keeps submit disabled until they are acknowledged", async () => {
    const user = userEvent.setup();
    post.mockImplementation(async (path: string) => {
      if (path.endsWith("/assignments/check")) {
        return ok({
          blocked: false,
          duplicate: false,
          conflicts: [{ type: "UNAVAILABLE" }],
        });
      }
      return ok(undefined);
    });
    renderDialog();

    await chooseWorkAndRole(user);

    expect(
      await screen.findByText(
        "The talent is marked unavailable for this window.",
      ),
    ).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Confirm assignment" });
    expect(confirm).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Assign anyway, knowing about these conflicts",
      }),
    );
    expect(confirm).toBeEnabled();
  });

  it("blocks an inactive talent from being assigned", async () => {
    const user = userEvent.setup();
    post.mockImplementation(async (path: string) => {
      if (path.endsWith("/assignments/check")) {
        return ok({ blocked: true, duplicate: false, conflicts: [] });
      }
      return ok(undefined);
    });
    renderDialog();

    await chooseWorkAndRole(user);

    expect(
      await screen.findByText(
        "Amina Tesfaye is inactive and cannot be assigned.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm assignment" }),
    ).toBeDisabled();
  });

  it("asks the user to confirm again when the server reports a conflict on submit", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    post.mockImplementation(async (path: string) => {
      if (path.endsWith("/assignments/check")) {
        return ok({ blocked: false, duplicate: false, conflicts: [] });
      }
      return {
        data: undefined,
        error: {
          code: "TALENT_ASSIGNMENT_CONFLICT",
          status: 409,
          errors: [{ type: "ASSIGNMENT_OVERLAP", title: "Night show" }],
        },
        response: { ok: false, status: 409 },
      };
    });
    renderDialog({ onSaved });

    await chooseWorkAndRole(user);
    await user.click(
      screen.getByRole("button", { name: "Confirm assignment" }),
    );

    expect(
      await screen.findByText(/conflicts with existing work/i),
    ).toBeVisible();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reports a saved assignment and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    post.mockImplementation(async (path: string) => {
      if (path.endsWith("/assignments/check")) {
        return ok({ blocked: false, duplicate: false, conflicts: [] });
      }
      return ok({ id: "asg-1", kind: "EVENT", workName: "Aurora Premiere" });
    });
    renderDialog({ onSaved, onOpenChange });

    await chooseWorkAndRole(user);
    await waitFor(() =>
      expect(
        screen.getByText("Available for this window. No conflicts found."),
      ).toBeVisible(),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm assignment" }),
    );

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith("Amina Tesfaye assigned."),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(within(document.body).queryByRole("alert")).toBeNull();
  });
});
