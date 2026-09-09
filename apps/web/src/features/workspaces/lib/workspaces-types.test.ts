import { describe, expect, it } from "vitest";

import {
  kindLabel,
  personName,
  WORKSPACE_KINDS,
  WORKSPACE_KIND_LABELS,
} from "./workspaces-types";

describe("workspaces-types", () => {
  it("labels every kind", () => {
    for (const kind of WORKSPACE_KINDS) {
      expect(kindLabel(kind)).toBe(WORKSPACE_KIND_LABELS[kind]);
      expect(kindLabel(kind)).not.toHaveLength(0);
    }
  });

  it("prefers a full name and falls back to the email", () => {
    expect(
      personName({ firstName: "Dana", lastName: "Okafor", email: "d@x.io" }),
    ).toBe("Dana Okafor");
    expect(
      personName({ firstName: "Dana", lastName: null, email: "d@x.io" }),
    ).toBe("Dana");
    expect(
      personName({ firstName: null, lastName: null, email: "d@x.io" }),
    ).toBe("d@x.io");
  });
});
