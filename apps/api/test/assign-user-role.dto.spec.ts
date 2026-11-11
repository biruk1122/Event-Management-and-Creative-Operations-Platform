import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { AssignUserRoleDto } from "../src/users/dto/assign-user-role.dto.js";

const ROLE_ID = "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77";

async function errorsFor(body: Record<string, unknown>) {
  return validate(plainToInstance(AssignUserRoleDto, body));
}

describe("AssignUserRoleDto", () => {
  it("accepts a role id", async () => {
    await expect(errorsFor({ roleId: ROLE_ID })).resolves.toHaveLength(0);
  });

  it("rejects a missing role id", async () => {
    const errors = await errorsFor({});
    expect(errors.map((error) => error.property)).toEqual(["roleId"]);
  });

  it("rejects a value that is not a UUID", async () => {
    const errors = await errorsFor({ roleId: "not-a-uuid" });
    expect(errors.map((error) => error.property)).toEqual(["roleId"]);
  });
});
