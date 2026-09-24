import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProductionsBoard } from "./productions-board";
import { ProductionMutationError } from "../lib/production-errors";
import type { Production } from "../lib/production-types";

const now = "2026-09-01T09:00:00.000Z";
const production: Production = {
  id: "p1",
  workspaceId: "w1",
  name: "Launch film",
  productionType: "Video Production",
  description: "Launch creative",
  startAt: now,
  endAt: null,
  deadlineAt: now,
  status: "PLANNED",
  manager: {
    id: "u1",
    email: "manager@example.com",
    firstName: "Ari",
    lastName: "Bek",
  },
  teams: [{ id: "t1", name: "Creative" }],
  participants: [],
  talents: [],
  createdBy: null,
  createdAt: now,
  updatedAt: now,
};

describe("ProductionsBoard", () => {
  it("filters records and shows the production workspace", async () => {
    const user = userEvent.setup();
    render(<ProductionsBoard state="ready" productions={[production]} />);
    await user.type(screen.getByLabelText("Search productions"), "unknown");
    expect(
      screen.getByText("No productions match these filters"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.click(screen.getByRole("button", { name: /Launch film/ }));
    const details = screen.getByRole("region", { name: "Production details" });
    expect(within(details).getByText("Creative")).toBeVisible();
    expect(within(details).getByText("Ari Bek")).toBeVisible();
    await user.click(within(details).getByRole("tab", { name: "Tasks" }));
    expect(within(details).getByRole("tab", { name: "Tasks" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(details).getByRole("link", { name: "Open Tasks" }),
    ).toHaveAttribute("href", "/tasks");
  });

  it("validates required fields before creating", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionsBoard
        state="ready"
        productions={[]}
        canCreate
        onCreate={onCreate}
      />,
    );
    await user.click(screen.getByRole("button", { name: "New production" }));
    await user.click(screen.getByRole("button", { name: "Save production" }));
    expect(screen.getByText("Enter a name.")).toBeVisible();
    expect(screen.getByText("Enter a production type.")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Launch film");
    await user.type(
      within(dialog).getByLabelText("Production type"),
      "Video Production",
    );
    await user.click(screen.getByRole("button", { name: "Save production" }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Launch film",
        productionType: "Video Production",
      }),
    );
  });

  it("supports denial, retry, and unconnected empty states", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const view = render(<ProductionsBoard state="denied" productions={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("do not have access");
    view.rerender(
      <ProductionsBoard state="error" productions={[]} onRetry={retry} />,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    view.rerender(
      <ProductionsBoard state="ready" productions={[]} canCreate />,
    );
    expect(screen.getByText("No productions yet")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "New production" }),
    ).toBeDisabled();
  });

  it("requires destructive confirmation", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionsBoard
        state="ready"
        productions={[production]}
        canDelete
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Launch film/ }));
    await user.click(screen.getByRole("button", { name: "Delete production" }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("button", { name: "Confirm delete" }),
    ).not.toBeInTheDocument();
  });

  it("offers assignment controls only with permission and callbacks", async () => {
    const user = userEvent.setup();
    const onAssignManager = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionsBoard
        state="ready"
        productions={[production]}
        canAssign
        availablePeople={[production.manager!]}
        onAssignManager={onAssignManager}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Launch film/ }));
    expect(screen.getByLabelText("Assign manager")).toBeEnabled();
    expect(screen.getByLabelText("Add member")).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Assign manager"), "");
    expect(onAssignManager).toHaveBeenCalledWith("p1", null);
  });

  it("preserves form values and displays API validation errors", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(
      new ProductionMutationError(400, {
        code: "VALIDATION_ERROR",
        status: 400,
        errors: { productionType: ["Choose a supported type."] },
      }),
    );
    render(
      <ProductionsBoard
        state="ready"
        productions={[]}
        canCreate
        onCreate={onCreate}
      />,
    );
    await user.click(screen.getByRole("button", { name: "New production" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Launch film");
    await user.type(within(dialog).getByLabelText("Production type"), "Video");
    await user.click(
      within(dialog).getByRole("button", { name: "Save production" }),
    );
    expect(
      await within(dialog).findByText("Choose a supported type."),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Launch film");
    expect(within(dialog).getByLabelText("Production type")).toHaveValue(
      "Video",
    );
  });
});
