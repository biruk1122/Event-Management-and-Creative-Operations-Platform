import { describe, expect, it } from "vitest";

import { validateFields, validateSocialLink } from "./talent-form";

const BASE = {
  fullName: "Amina Tesfaye",
  type: "MUSICIAN" as const,
  email: "",
  phone: "",
  biography: "",
};

describe("talent phone number", () => {
  it("accepts digits with a leading plus and common separators", () => {
    expect(validateFields({ ...BASE, phone: "+251 911 000 000" })).toEqual({});
    expect(validateFields({ ...BASE, phone: "(011) 123-4567" })).toEqual({});
  });

  it("rejects letters and characters a phone number does not use", () => {
    expect(validateFields({ ...BASE, phone: "call me" })).toEqual({
      phone: "Enter a phone number with digits, spaces or + only.",
    });
    expect(validateFields({ ...BASE, phone: "12" }).phone).toBeDefined();
  });

  it("leaves a blank phone alone", () => {
    expect(validateFields({ ...BASE, phone: "  " })).toEqual({});
  });
});

describe("talent social link", () => {
  it("treats a link with neither field filled as absent", () => {
    expect(validateSocialLink({ label: " ", url: "" })).toEqual({});
  });

  it("needs a name and an address together", () => {
    expect(validateSocialLink({ label: "", url: "https://x.example" })).toEqual(
      { label: "Name the link, for example Instagram." },
    );
    expect(validateSocialLink({ label: "Site", url: "" })).toEqual({
      url: "Enter the link address.",
    });
  });

  it("accepts http and https addresses only", () => {
    expect(
      validateSocialLink({ label: "Site", url: "https://example.com" }),
    ).toEqual({});
    expect(
      validateSocialLink({ label: "Site", url: "http://example.com" }),
    ).toEqual({});
    expect(
      validateSocialLink({ label: "Site", url: "ftp://example.com" }),
    ).toEqual({ url: "Use an http or https address." });
    expect(validateSocialLink({ label: "Site", url: "example" })).toEqual({
      url: "Enter a full address, starting with https://",
    });
  });
});
