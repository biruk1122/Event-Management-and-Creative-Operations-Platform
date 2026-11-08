import { describe, expect, it } from "vitest";
import { categoryLabel, reasonLabel, statusLabel } from "./sms-labels";

describe("SMS labels", () => {
  it("keeps failed, skipped, cancelled, accepted and uncertain messages distinct", () => {
    const labels = [
      "FAILED",
      "SKIPPED",
      "CANCELLED",
      "ACCEPTED",
      "UNCERTAIN",
    ].map((status) => statusLabel(status).label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(statusLabel("UNCERTAIN").detail).toContain("Do not resend");
  });

  it("never describes a skipped or failed message as sent", () => {
    expect(statusLabel("SKIPPED").label).not.toMatch(/sent|delivered/i);
    expect(statusLabel("FAILED").label).not.toMatch(/sent|delivered/i);
  });

  it("explains cancellation reasons and humanises unknown codes", () => {
    expect(reasonLabel("GLOBAL_DISABLED")).toBe("SMS delivery is switched off");
    expect(reasonLabel("CATEGORY_DISABLED")).toBe(
      "This message category is switched off",
    );
    expect(reasonLabel("SOME_NEW_REASON")).toBe("some new reason");
    expect(reasonLabel(null)).toBeNull();
  });

  it("names categories and falls back to a readable form for unknown ones", () => {
    expect(categoryLabel("TASK_ASSIGNED")).toBe("Task assigned");
    expect(categoryLabel("FUTURE_CATEGORY")).toBe("future category");
  });
});
