import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeTalent } from "../test-data";
import { TalentProfileOverview } from "./talent-profile-overview";

describe("TalentProfileOverview", () => {
  it("shows the identity, biography and contact details", () => {
    render(
      <TalentProfileOverview
        talent={makeTalent({
          fullName: "Selam Tesfaye",
          type: "MUSICIAN",
          biography: "Contemporary sound.",
          email: "selam@example.com",
          phone: "+251 911 000 101",
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Selam Tesfaye", level: 2 }),
    ).toBeVisible();
    expect(screen.getByText("Musician")).toBeVisible();
    // The hero line and the Biography card both show the biography.
    expect(screen.getAllByText("Contemporary sound.")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "selam@example.com" }),
    ).toHaveAttribute("href", "mailto:selam@example.com");
    expect(screen.getByText("+251 911 000 101")).toBeVisible();
  });

  it("lists schedule entries in time order and says when there are none", () => {
    const { unmount } = render(
      <TalentProfileOverview
        talent={makeTalent({
          schedules: [
            {
              id: "late",
              title: "Creative review",
              startAt: "2026-06-02T14:00:00.000Z",
              endAt: "2026-06-02T14:45:00.000Z",
            },
            {
              id: "early",
              title: "Production stand-up",
              startAt: "2026-06-02T09:30:00.000Z",
              endAt: "2026-06-02T10:00:00.000Z",
            },
          ],
        })}
      />,
    );

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Production stand-up");
    expect(items[0]).toHaveTextContent("30 min");
    expect(items[1]).toHaveTextContent("Creative review");
    unmount();

    render(<TalentProfileOverview talent={makeTalent({ schedules: [] })} />);
    expect(
      screen.getByText("No scheduled time yet. Add entries from Edit profile."),
    ).toBeVisible();
  });

  it("reports an archived talent as inactive", () => {
    render(
      <TalentProfileOverview
        talent={makeTalent({ availability: "INACTIVE" })}
      />,
    );

    expect(screen.getByText("Status").nextElementSibling).toHaveTextContent(
      "Inactive",
    );
  });
});
