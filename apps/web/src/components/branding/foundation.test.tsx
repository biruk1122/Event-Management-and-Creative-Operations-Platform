import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./brand-logo";
import { PageHeader } from "../ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { SectionNavigation } from "../ui/section-navigation";
import { FoundationExamples } from "./foundation-examples";

describe("Lela foundation primitives", () => {
  it("labels example data, supplies chart equivalents and excludes unsupported auth", () => {
    const { container, rerender } = render(<FoundationExamples />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Lela design foundation",
    );
    expect(screen.getByRole("table")).toHaveAccessibleName(
      "Chart specimen values (not company data)",
    );
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autoComplete",
      "email",
    );
    expect(screen.getByLabelText("Report title")).toHaveAccessibleDescription(
      "Example error: enter a report title.",
    );
    expect(
      screen.queryByText(/google|sign up|forgot password/i),
    ).not.toBeInTheDocument();
    expect(container.querySelector("main")).not.toHaveClass("dark");
    rerender(<FoundationExamples dark />);
    expect(container.querySelector("main")).toHaveClass("dark");
  });
  it("uses original full and compact artwork with reserved proportions", () => {
    const { container, rerender } = render(<BrandLogo />);
    expect(
      screen.getByRole("img", { name: "Lela Creative Management" }),
    ).toHaveAttribute("viewBox", "22 387 785 503");
    expect(container.querySelector("image")).toHaveAttribute(
      "href",
      "/branding/lela-creative-management-logo.png",
    );
    rerender(<BrandLogo compact />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "viewBox",
      "22 387 316 502",
    );
  });

  it("allows decorative branding without duplicate accessible names", () => {
    const { container } = render(<BrandLogo decorative />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("keeps a single page heading, description and native action", () => {
    render(
      <PageHeader
        title="Production"
        description="Your permitted project work."
        actions={<button type="button">New project</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Production" }),
    ).toBeVisible();
    expect(screen.getByText("Your permitted project work.")).toBeVisible();
    expect(screen.getByRole("button", { name: "New project" })).toBeVisible();
  });

  it("supports a labelled card with semantic heading and consumer attributes", () => {
    render(
      <Card aria-labelledby="card-title">
        <CardHeader>
          <CardTitle id="card-title">Your reports</CardTitle>
          <CardDescription>Daily, weekly and monthly.</CardDescription>
        </CardHeader>
        <p>No reports yet.</p>
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Your reports" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Your reports",
    );
  });

  it("uses native navigation links with a non-color-only active indicator", () => {
    render(
      <SectionNavigation
        label="Work views"
        items={[
          { label: "Tasks", href: "/tasks", current: true },
          { label: "Calendar", href: "/calendar" },
        ]}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Work views" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveClass(
      "underline",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
