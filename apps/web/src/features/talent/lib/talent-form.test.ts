import { describe, expect, it } from "vitest";

import { EMPTY_FIELDS, fieldsFromTalent, validateFields } from "./talent-form";
import type { Talent } from "./talent-types";

function makeTalent(overrides: Partial<Talent> = {}): Talent {
  return {
    id: "tal-1",
    fullName: "Amina Tesfaye",
    type: "MUSICIAN",
    profileImageId: null,
    email: null,
    phone: null,
    biography: null,
    availability: "AVAILABLE",
    manager: null,
    socialLinks: [],
    schedules: [],
    eventAssignments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("talent form", () => {
  describe("fieldsFromTalent", () => {
    it("maps null contact fields to empty strings", () => {
      expect(fieldsFromTalent(makeTalent())).toEqual({
        fullName: "Amina Tesfaye",
        type: "MUSICIAN",
        email: "",
        phone: "",
        biography: "",
      });
    });

    it("preserves set contact fields", () => {
      const fields = fieldsFromTalent(
        makeTalent({ email: "amina@example.com", phone: "+251911000000" }),
      );
      expect(fields.email).toBe("amina@example.com");
      expect(fields.phone).toBe("+251911000000");
    });
  });

  describe("validateFields", () => {
    it("requires a non-blank full name", () => {
      expect(validateFields({ ...EMPTY_FIELDS, fullName: "" }).fullName).toBe(
        "Enter a name.",
      );
      expect(
        validateFields({ ...EMPTY_FIELDS, fullName: "   " }).fullName,
      ).toBe("Enter a name.");
    });

    it("accepts an empty email but rejects a malformed one", () => {
      expect(
        validateFields({ ...EMPTY_FIELDS, fullName: "x", email: "" }).email,
      ).toBeUndefined();
      expect(
        validateFields({
          ...EMPTY_FIELDS,
          fullName: "x",
          email: "not-an-email",
        }).email,
      ).toBe("Enter a valid email address.");
    });

    it("passes with a valid full name and email", () => {
      expect(
        validateFields({
          ...EMPTY_FIELDS,
          fullName: "Amina Tesfaye",
          email: "amina@example.com",
        }),
      ).toEqual({});
    });
  });
});
