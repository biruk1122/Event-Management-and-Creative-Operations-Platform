import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionExpiredNotice } from "./session-expired-notice";

type LinkHref = string | { pathname: string; query?: Record<string, string> };

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: Omit<ComponentProps<"a">, "href"> & { href: LinkHref }) => {
    const resolved =
      typeof href === "string"
        ? href
        : href.query
          ? `${href.pathname}?${new URLSearchParams(href.query).toString()}`
          : href.pathname;
    return (
      <a href={resolved} {...props}>
        {children}
      </a>
    );
  },
}));

describe("SessionExpiredNotice", () => {
  it("explains the sign-out and links straight back to sign in", () => {
    render(<SessionExpiredNotice />);

    expect(
      screen.getByRole("heading", { name: "Your session has ended" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login");
  });

  it("preserves the originating path as an encoded next parameter", () => {
    render(<SessionExpiredNotice next="/events/42/tasks" />);

    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login?next=%2Fevents%2F42%2Ftasks");
  });
});
