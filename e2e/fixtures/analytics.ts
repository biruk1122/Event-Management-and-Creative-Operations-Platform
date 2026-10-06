import { randomUUID } from "node:crypto";
import { queryInSchema } from "./database.js";

export const analyticsPeriod = {
  from: "2001-09-01",
  toExclusive: "2001-10-01",
};

export function analyticsDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (
    !url ||
    new URL(url).searchParams.get("schema") !== process.env.E2E_SCHEMA
  )
    throw new Error(
      "Analytics fixtures require the harness's isolated datasource.",
    );
  return url;
}

/** Historical, deliberately small fixtures; never installed in application code. */
export async function seedAnalyticsFixture() {
  const db = analyticsDatabaseUrl();
  const query = (sql: string, params: readonly unknown[] = []) =>
    queryInSchema(db, sql, params);
  const departments = Array.from({ length: 29 }, () => randomUUID());
  const [departmentA, departmentB, emptyDepartment] = departments as [
    string,
    string,
    string,
    ...string[],
  ];
  const workspaces = Array.from({ length: 6 }, () => randomUUID());
  const [
    eventWorkspace,
    emptyWorkspace,
    marketingWorkspace,
    promotionWorkspace,
    projectWorkspace,
    productionWorkspace,
  ] = workspaces as [string, string, string, string, string, string];
  const event = randomUUID(),
    emptyEvent = randomUUID(),
    marketing = randomUUID(),
    promotion = randomUUID();
  const project = randomUUID(),
    production = randomUUID();
  const tasks = Array.from({ length: 6 }, () => randomUUID());
  const users = await query(
    "SELECT id, email, department_id FROM users WHERE email IN ('dept-manager@e2e.test', 'member@e2e.test')",
  );
  const manager = users.find((row) => row.email === "dept-manager@e2e.test");
  const employee = users.find((row) => row.email === "member@e2e.test");
  if (!manager || !employee)
    throw new Error("Missing canonical analytics principals.");
  for (const [index, id] of departments.entries())
    await query("INSERT INTO departments (id, name) VALUES ($1, $2)", [
      id,
      `ANA-06 ${id} ${index}`,
    ]);
  await query("UPDATE users SET department_id = $1 WHERE id = $2", [
    departmentA,
    manager.id,
  ]);
  for (const [index, id] of workspaces.entries())
    await query(
      "INSERT INTO workspaces (id, kind) VALUES ($1, $2::workspace_kind)",
      [
        id,
        ["EVENT", "EVENT", "CAMPAIGN", "CAMPAIGN", "PROJECT", "PRODUCTION"][
          index
        ],
      ],
    );
  await query(
    "INSERT INTO events (id, workspace_id, name, event_type, created_at) VALUES ($1,$2,'ANA-06 Event','CONCERT',$5),($3,$4,'ANA-06 Empty','CONCERT',$5)",
    [event, eventWorkspace, emptyEvent, emptyWorkspace, analyticsPeriod.from],
  );
  await query(
    "INSERT INTO campaigns (id, workspace_id, name, campaign_type, created_at) VALUES ($1,$2,'ANA-06 Marketing','MARKETING',$5),($3,$4,'ANA-06 Promotion','PROMOTION',$5)",
    [
      marketing,
      marketingWorkspace,
      promotion,
      promotionWorkspace,
      analyticsPeriod.from,
    ],
  );
  await query(
    "INSERT INTO projects (id, workspace_id, name, created_at) VALUES ($1,$2,'ANA-06 Project',$3)",
    [project, projectWorkspace, analyticsPeriod.from],
  );
  await query(
    "INSERT INTO productions (id, workspace_id, name, production_type, created_at) VALUES ($1,$2,'ANA-06 Production','Film',$3)",
    [production, productionWorkspace, analyticsPeriod.from],
  );
  const taskRows = [
    [departmentA, "COMPLETED", "2001-09-01T00:00:00Z", null],
    [departmentA, "TODO", "2001-09-15T00:00:00Z", "2001-09-16T00:00:00Z"],
    [departmentA, "CANCELLED", "2001-09-20T00:00:00Z", "2001-09-21T00:00:00Z"],
    [departmentB, "UNDER_REVIEW", "2001-09-30T23:59:59.999Z", null],
    [departmentB, "COMPLETED", "2001-08-31T23:59:59.999Z", null],
    [departmentB, "COMPLETED", "2001-10-01T00:00:00Z", null],
  ];
  for (const [index, row] of taskRows.entries())
    await query(
      "INSERT INTO tasks (id, department_id, workspace_id, title, status, created_at, due_at) VALUES ($1,$2,$3,'ANA-06 task',$4::task_status,$5,$6)",
      [tasks[index], row[0], eventWorkspace, ...row.slice(1)],
    );
  await query(
    "INSERT INTO task_assignments (task_id, user_id) VALUES ($1,$2),($1,$3),($4,$2)",
    [tasks[0], manager.id, employee.id, tasks[1]],
  );
  await query(
    `INSERT INTO task_activities (task_id,type,details,occurred_at) VALUES
    ($1,'STATUS_CHANGED','{"to":"COMPLETED"}','2001-09-01'),
    ($1,'STATUS_CHANGED','{"to":"COMPLETED"}','2001-09-02'),
    ($2,'STATUS_CHANGED','{"to":"COMPLETED"}','2001-09-03'),
    ($1,'PROGRESS_UPDATED','{"to":"COMPLETED"}','2001-09-04')`,
    [tasks[0], tasks[4]],
  );
  for (const status of ["COMPLETED", "PLANNED", "CANCELLED"])
    await query(
      "INSERT INTO campaign_activities (campaign_id, name, status) VALUES ($1,'ANA-06 activity',$2::campaign_activity_status)",
      [marketing, status],
    );
  for (const [status, channel] of [
    ["COMPLETED", "RADIO_PROMOTION"],
    ["PLANNED", "RADIO_PROMOTION"],
    ["CANCELLED", "SOCIAL_MEDIA"],
    ["COMPLETED", null],
  ]) {
    const id = randomUUID();
    await query(
      "INSERT INTO campaign_activities (id,campaign_id,name,status) VALUES ($1,$2,'ANA-06 promotion',$3::campaign_activity_status)",
      [id, promotion, status],
    );
    if (channel)
      await query(
        "INSERT INTO promotion_activities (campaign_activity_id,campaign_id,channel) VALUES ($1,$2,$3::promotion_channel)",
        [id, promotion, channel],
      );
  }
  return {
    departmentA,
    departmentB,
    emptyDepartment,
    event,
    emptyEvent,
    marketing,
    promotion,
    managerId: String(manager.id),
    employeeId: String(employee.id),
    async setManagerDepartment(id: string | null) {
      await query("UPDATE users SET department_id = $1 WHERE id = $2", [
        id,
        manager.id,
      ]);
    },
    async cleanup() {
      // Only this fixture's UUIDs; never truncate or touch the public schema.
      await query(
        "UPDATE users SET department_id = $1 WHERE id = $2 AND (department_id = ANY($3::uuid[]) OR department_id IS NULL)",
        [manager.department_id, manager.id, departments],
      );
      await query("DELETE FROM tasks WHERE id = ANY($1::uuid[])", [tasks]);
      await query("DELETE FROM projects WHERE id = $1", [project]);
      await query("DELETE FROM productions WHERE id = $1", [production]);
      await query("DELETE FROM campaigns WHERE id = ANY($1::uuid[])", [
        [marketing, promotion],
      ]);
      await query("DELETE FROM events WHERE id = ANY($1::uuid[])", [
        [event, emptyEvent],
      ]);
      await query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [
        workspaces,
      ]);
      await query("DELETE FROM departments WHERE id = ANY($1::uuid[])", [
        departments,
      ]);
    },
  };
}
