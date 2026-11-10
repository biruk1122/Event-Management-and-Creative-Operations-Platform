import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiscussHeader } from "./discuss-header";

describe("DiscussHeader", () => {
  it("shows the direct-message title, description and totals", () => {
    render(
      <DiscussHeader
        kind="dm"
        count={6}
        hasMore={false}
        groupCount={1}
        initials={["EM", "PL"]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Direct messages" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Message one person directly, or start a group."),
    ).toBeInTheDocument();
    expect(screen.getByText("6 conversations")).toBeInTheDocument();
    expect(screen.getByText("1 group")).toBeInTheDocument();
  });

  it("marks a partial list as a lower bound, never as the total", () => {
    render(
      <DiscussHeader
        kind="dm"
        count={25}
        hasMore
        groupCount={0}
        initials={[]}
      />,
    );
    expect(screen.getByText("25+ conversations")).toBeInTheDocument();
  });

  it("uses channel wording and omits group totals for channels", () => {
    render(
      <DiscussHeader
        kind="channel"
        count={1}
        hasMore={false}
        groupCount={0}
        initials={[]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Channels" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 channel")).toBeInTheDocument();
    expect(screen.queryByText(/group/)).not.toBeInTheDocument();
  });

  it("keeps the decorative initials out of the accessibility tree", () => {
    render(
      <DiscussHeader
        kind="dm"
        count={2}
        hasMore={false}
        groupCount={0}
        initials={["EM", "PL"]}
      />,
    );
    const stack = screen.getByText("EM").closest('[aria-hidden="true"]');
    expect(stack).not.toBeNull();
    expect(stack).toHaveTextContent("PL");
  });
});
