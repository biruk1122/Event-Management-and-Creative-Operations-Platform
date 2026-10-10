import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReportDraftForm } from "./report-draft-form";

describe("Report draft interactions", () => {
  it("preserves narrative values across period switches, but saves only current sections", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(
      <ReportDraftForm workspaces={[]} onCancel={vi.fn()} onSave={save} />,
    );
    await user.type(screen.getByLabelText("Title"), "Daily progress");
    await user.type(
      screen.getByLabelText("Problems encountered"),
      "Keep this blocker",
    );
    await user.type(screen.getByLabelText("Next day's plan"), "Next steps");
    expect(screen.getByText("2 of 2 sections filled")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Report type"), "MONTHLY");
    await user.type(
      screen.getByLabelText("Employee performance"),
      "Monthly notes",
    );
    await user.selectOptions(screen.getByLabelText("Report type"), "DAILY");
    expect(screen.getByLabelText("Problems encountered")).toHaveValue(
      "Keep this blocker",
    );
    await user.type(screen.getByLabelText("Period start (UTC)"), "2024-02-01");
    await user.type(screen.getByLabelText("Period end (UTC)"), "2024-02-01");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(save).toHaveBeenCalledWith({
      title: "Daily progress",
      type: "DAILY",
      periodStart: "2024-02-01",
      periodEnd: "2024-02-01",
      workspaceIds: [],
      problemsEncountered: "Keep this blocker",
      nextDayPlan: "Next steps",
    });
  });

  it("keeps the initiating save focused and blocks repeat submit while busy", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    const props = { workspaces: [], onCancel: vi.fn(), onSave: save };
    const { rerender } = render(<ReportDraftForm {...props} />);
    const button = screen.getByRole("button", { name: "Save draft" });
    button.focus();
    rerender(<ReportDraftForm {...props} busy />);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Title")).toHaveAttribute("readonly");
    await user.click(button);
    fireEvent.submit(screen.getByRole("form", { name: "Report draft" }));
    expect(save).not.toHaveBeenCalled();
    rerender(<ReportDraftForm {...props} />);
    expect(button).toHaveFocus();
  });
});
