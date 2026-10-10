import { beforeEach, describe, expect, it, vi } from "vitest";
import { loginDestination } from "./login-destination";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));
const data = {
  userId: "member",
  grants: [
    { permissionKey: "calendar.read", scope: "SELF" },
    { permissionKey: "conversation.read", scope: "SELF" },
  ],
};
beforeEach(() => {
  get.mockReset();
});
describe("loginDestination", () => {
  it("skips an unnecessary permission request for default/root entry", async () => {
    expect(await loginDestination(undefined)).toBe("/dashboard");
    expect(await loginDestination("/")).toBe("/dashboard");
    expect(get).not.toHaveBeenCalled();
  });
  it("rechecks current grants and preserves a permitted destination", async () => {
    get.mockResolvedValue({ data });
    expect(await loginDestination("/calendar?view=week")).toBe(
      "/calendar?view=week",
    );
    expect(get).toHaveBeenCalledWith("/api/v1/auth/me/permissions", {
      cache: "no-store",
    });
  });
  it("fails closed without misreporting successful login as a failure", async () => {
    get.mockRejectedValue(new Error("offline"));
    expect(await loginDestination("/calendar")).toBe("/dashboard");
    get.mockResolvedValue({ data: undefined });
    expect(await loginDestination("/calendar")).toBe("/dashboard");
  });
  it("does not return a module-denied destination", async () => {
    get.mockResolvedValue({ data });
    expect(await loginDestination("/users")).toBe("/dashboard");
  });
  const target = "/discuss/dm/12345678-1234-1234-1234-123456789abc";
  it("requires server-authorized record access for a private conversation", async () => {
    get
      .mockResolvedValueOnce({ data })
      .mockResolvedValueOnce({ data: undefined });
    expect(await loginDestination(target)).toBe("/dashboard");
    expect(get).toHaveBeenLastCalledWith("/api/v1/conversations/{id}", {
      params: { path: { id: "12345678-1234-1234-1234-123456789abc" } },
      cache: "no-store",
    });
  });
  it("allows an authorized conversation but not a mismatched route kind", async () => {
    get
      .mockResolvedValueOnce({ data })
      .mockResolvedValueOnce({ data: { type: "DIRECT" } });
    expect(await loginDestination(target)).toBe(target);
    get
      .mockResolvedValueOnce({ data })
      .mockResolvedValueOnce({ data: { type: "CHANNEL" } });
    expect(await loginDestination(target)).toBe("/dashboard");
  });
});
