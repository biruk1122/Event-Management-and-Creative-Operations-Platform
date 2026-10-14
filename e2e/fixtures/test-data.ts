import type { APIRequestContext } from "@playwright/test";
import { apiBaseUrl, e2eRunId } from "./environment.js";

export async function departmentIdFor(
  request: APIRequestContext,
): Promise<string> {
  const response = await request.get(
    `${apiBaseUrl}/api/v1/departments?search=Production&pageSize=100`,
  );
  if (!response.ok())
    throw new Error(`Cannot load the fixture department: ${response.status()}`);
  const data = (await response.json()) as {
    items: { id: string; name: string }[];
  };
  const department = data.items.find((item) => item.name === "Production");
  if (!department) throw new Error("Production fixture department is missing");
  return department.id;
}

let sequence = 0;

export async function memberAssignmentFor(request: APIRequestContext) {
  const response = await request.get(`${apiBaseUrl}/api/v1/roles`);
  if (!response.ok()) throw new Error("Cannot load fixture roles");
  const roles = (await response.json()) as { id: string; name: string }[];
  const role = roles.find((item) => item.name === "Department Member");
  if (!role) throw new Error("Department Member fixture role is missing");
  return { roleId: role.id, departmentId: await departmentIdFor(request) };
}

/**
 * Produces a minimal, run-scoped label for data created by an e2e spec. It is
 * deliberately only available from the test harness, never application code.
 */
export function fixtureName(prefix: string): string {
  const normalized = prefix.trim().replaceAll(/[^a-zA-Z0-9]+/g, "-");
  if (!normalized) {
    throw new Error("A fixture name requires a non-blank prefix.");
  }
  sequence += 1;
  return `${normalized}-${e2eRunId}-${sequence}`;
}

export function fixtureEmail(prefix = "user"): string {
  return `${fixtureName(prefix).toLowerCase()}@e2e.test`;
}
