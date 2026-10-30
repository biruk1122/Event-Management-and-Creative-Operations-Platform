import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("renders only the text alternative when nothing is tracked yet", () => {
    render(<ProgressBar percent={null} summary="Not tracked" />);
    expect(screen.getByText("Not tracked")).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("defaults to the original solid-primary fill when no tone is given", () => {
    render(<ProgressBar percent={40} summary="40% complete" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.firstElementChild?.className).toContain("bg-primary");
  });

  it("selects the fill class for each status tone", () => {
    const expected = {
      neutral: "bg-muted-foreground/40",
      active: "bg-primary",
      attention: "bg-warning",
      success: "bg-success",
      danger: "bg-destructive",
    } as const;
    for (const [tone, className] of Object.entries(expected)) {
      const { unmount } = render(
        <ProgressBar
          percent={50}
          summary="50% complete"
          tone={tone as keyof typeof expected}
        />,
      );
      expect(
        screen.getByRole("progressbar").firstElementChild?.className,
      ).toContain(className);
      unmount();
    }
  });
});
