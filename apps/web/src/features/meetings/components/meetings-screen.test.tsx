import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MeetingsScreen } from "./meetings-screen";

describe("MeetingsScreen", () => {
  it("announces a final accepted response and disables both response controls", async () => {
    const user = userEvent.setup();
    render(<MeetingsScreen />);
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByRole("status")).toHaveTextContent("marked accepted");
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();
  });

  it("provides an understandable empty state and disabled scheduling recovery guidance", () => {
    render(<MeetingsScreen />);
    expect(screen.getByText("No meetings to show")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Schedule meeting" }),
    ).toBeDisabled();
    expect(screen.getByText(/Scheduling will be available/)).toBeInTheDocument();
  });
});
