import { describe, expect, it } from "vitest";

import { makeCampaign } from "../test-data";
import {
  EMPTY_FIELDS,
  fieldsFromCampaign,
  toFormValues,
  validateFields,
} from "./campaigns-form";

describe("campaigns-form", () => {
  describe("fieldsFromCampaign", () => {
    it("reads a campaign with no subject", () => {
      expect(fieldsFromCampaign(makeCampaign())).toMatchObject({
        name: "Aurora Awareness",
        campaignType: "PROMOTION",
        description: "Awareness push.",
        audience: "Film fans",
        startAt: "",
        endAt: "",
        subjectKind: "NONE",
        eventId: null,
        productName: "",
      });
    });

    it("recognises an event subject and a product subject", () => {
      expect(fieldsFromCampaign(makeCampaign({ eventId: "e1" }))).toMatchObject(
        { subjectKind: "EVENT", eventId: "e1" },
      );
      expect(
        fieldsFromCampaign(makeCampaign({ productName: "Orbit" })),
      ).toMatchObject({ subjectKind: "PRODUCT", productName: "Orbit" });
    });

    it("trims ISO instants to what a datetime-local input accepts", () => {
      const fields = fieldsFromCampaign(
        makeCampaign({
          startAt: "2026-10-01T18:00:00.000Z",
          endAt: "2026-10-02T02:30:00.000Z",
        }),
      );

      expect(fields.startAt).toBe("2026-10-01T18:00");
      expect(fields.endAt).toBe("2026-10-02T02:30");
    });

    it("turns missing text into empty strings", () => {
      expect(
        fieldsFromCampaign(makeCampaign({ description: null, audience: null })),
      ).toMatchObject({ description: "", audience: "" });
    });
  });

  describe("validateFields", () => {
    const valid = { ...EMPTY_FIELDS, name: "A campaign" };

    it("accepts a named campaign", () => {
      expect(validateFields(valid)).toEqual({});
    });

    it("requires a non-blank name", () => {
      expect(validateFields({ ...valid, name: "   " }).name).toBe(
        "Enter a name.",
      );
    });

    it("rejects an end before the start but allows equal or one-sided ranges", () => {
      expect(
        validateFields({
          ...valid,
          startAt: "2026-10-02T10:00",
          endAt: "2026-10-01T10:00",
        }).endAt,
      ).toBe("The end must be on or after the start.");
      expect(
        validateFields({
          ...valid,
          startAt: "2026-10-01T10:00",
          endAt: "2026-10-01T10:00",
        }),
      ).toEqual({});
      expect(validateFields({ ...valid, endAt: "2026-10-01T10:00" })).toEqual(
        {},
      );
    });

    it("requires an event when the subject is an event", () => {
      expect(
        validateFields({ ...valid, subjectKind: "EVENT", eventId: null })
          .eventId,
      ).toBe("Pick an event.");
      expect(
        validateFields({ ...valid, subjectKind: "EVENT", eventId: "e1" }),
      ).toEqual({});
    });

    it("requires a product name when the subject is a product", () => {
      expect(
        validateFields({ ...valid, subjectKind: "PRODUCT", productName: " " })
          .productName,
      ).toBe("Enter a product name.");
      expect(
        validateFields({
          ...valid,
          subjectKind: "PRODUCT",
          productName: "Orbit",
        }),
      ).toEqual({});
    });

    it("ignores the subject fields the chosen kind does not use", () => {
      expect(
        validateFields({
          ...valid,
          subjectKind: "NONE",
          eventId: null,
          productName: "",
        }),
      ).toEqual({});
    });
  });

  describe("toFormValues", () => {
    const base = { ...EMPTY_FIELDS, name: "N" };

    it("keeps only the chosen subject", () => {
      expect(
        toFormValues({
          ...base,
          subjectKind: "EVENT",
          eventId: "e1",
          productName: "left over",
        }),
      ).toMatchObject({ eventId: "e1", productName: "" });
      expect(
        toFormValues({
          ...base,
          subjectKind: "PRODUCT",
          eventId: "left over",
          productName: "Orbit",
        }),
      ).toMatchObject({ eventId: null, productName: "Orbit" });
    });

    it("clears both when there is no subject", () => {
      expect(
        toFormValues({
          ...base,
          subjectKind: "NONE",
          eventId: "e1",
          productName: "Orbit",
        }),
      ).toMatchObject({ eventId: null, productName: "" });
    });

    it("never carries the UI-only subject kind to the API", () => {
      expect(toFormValues(base)).not.toHaveProperty("subjectKind");
    });
  });
});
