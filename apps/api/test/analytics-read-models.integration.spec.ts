import { readFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  type IsolatedDatabase,
} from "./support/database.js";

const sql = Object.fromEntries(
  readFileSync(
    new URL("./fixtures/analytics-read-models.sql", import.meta.url),
    "utf8",
  )
    .split("-- model: ")
    .slice(1)
    .map((section) => {
      const newline = section.indexOf("\n");
      return [section.slice(0, newline).trim(), section.slice(newline)];
    }),
);
const FROM = "2026-09-01T00:00:00Z";
const TO = "2026-10-01T00:00:00Z";
const AS_OF = TO;
const id = (number: number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Actual Rows": number;
  "Shared Hit Blocks": number;
  "Shared Read Blocks": number;
  Plans?: PlanNode[];
}
interface Explain {
  Plan: PlanNode;
  "Planning Time": number;
  "Execution Time": number;
}
function scans(node: PlanNode): string[] {
  return [
    ...(node["Relation Name"] || node["Index Name"]
      ? [
          `${node["Node Type"]}: ${node["Relation Name"] ?? node["Index Name"]}${node["Relation Name"] && node["Index Name"] ? ` (${node["Index Name"]})` : ""}`,
        ]
      : []),
    ...(node.Plans ?? []).flatMap(scans),
  ];
}

describe("EVE-171 analytics read-model specimens", () => {
  let db: IsolatedDatabase;
  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  const query = (name: string, values: unknown[]) => {
    const statement = sql[name];
    if (!statement) throw new Error(`Unknown analytics specimen: ${name}`);
    return db.query(statement, values);
  };

  it("defines distinct, scoped counts, UTC boundaries, rounding, empty sets and channel progress", async () => {
    await db.query(
      `INSERT INTO departments (id, name) VALUES ($1, 'A'), ($2, 'B'), ($3, 'Empty')`,
      [id(1), id(2), id(3)],
    );
    await db.query(
      `INSERT INTO users (id, email) VALUES ($1, 'a@test.invalid'), ($2, 'b@test.invalid'), ($3, 'empty@test.invalid')`,
      [id(11), id(12), id(13)],
    );
    await db.query(
      `INSERT INTO workspaces (id, kind) VALUES ($1, 'EVENT'), ($2, 'EVENT'), ($3, 'CAMPAIGN'), ($4, 'CAMPAIGN'), ($5, 'CAMPAIGN')`,
      [id(21), id(22), id(23), id(24), id(25)],
    );
    await db.query(
      `INSERT INTO campaigns (id, workspace_id, name, campaign_type, created_at)
      VALUES ($1, $2, 'Marketing', 'MARKETING', $7), ($3, $4, 'Promotion', 'PROMOTION', $7), ($5, $6, 'Empty', 'MARKETING', $7)`,
      [id(31), id(23), id(32), id(24), id(33), id(25), FROM],
    );
    const taskRows = [
      [41, 1, 21, "COMPLETED", FROM, "2026-09-01"],
      [42, 1, 21, "TODO", FROM, "2026-09-30"],
      [43, 1, 21, "CANCELLED", FROM, "2026-09-30"],
      [44, 2, 21, "IN_PROGRESS", TO, null],
      [45, 2, 22, "BLOCKED", "2026-08-31T23:59:59Z", TO],
      [46, 2, 22, "UNDER_REVIEW", FROM, TO],
      [47, 2, 22, "COMPLETED", FROM, null],
      [48, null, 22, "COMPLETED", FROM, null],
    ] as const;
    for (const [
      task,
      department,
      workspace,
      status,
      created,
      due,
    ] of taskRows) {
      await db.query(
        `INSERT INTO tasks (id, department_id, workspace_id, title, status, created_at, due_at)
        VALUES ($1, $2, $3, 'Fixture', $4, $5, $6)`,
        [
          id(task),
          department === null ? null : id(department),
          id(workspace),
          status,
          created,
          due,
        ],
      );
    }
    await db.query(
      `INSERT INTO task_assignments (task_id, user_id) VALUES ($1, $2), ($1, $3), ($4, $2)`,
      [id(41), id(11), id(12), id(42)],
    );
    await db.query(
      `INSERT INTO task_activities (task_id, type, details, occurred_at) VALUES
      ($1, 'STATUS_CHANGED', '{"to":"COMPLETED"}', $4),
      ($1, 'STATUS_CHANGED', '{"to":"COMPLETED"}', '2026-09-02'),
      ($1, 'PROGRESS_UPDATED', '{"to":"COMPLETED"}', $4),
      ($2, 'STATUS_CHANGED', '{"to":"COMPLETED"}', $4),
      ($3, 'STATUS_CHANGED', '{"to":"COMPLETED"}', $5)`,
      [id(41), id(47), id(48), FROM, TO],
    );
    await db.query(
      `INSERT INTO campaign_activities (id, campaign_id, name, status) VALUES
      ($1, $7, 'Done', 'COMPLETED'), ($2, $7, 'Planned', 'PLANNED'), ($3, $7, 'Cancelled', 'CANCELLED'),
      ($4, $8, 'Radio done', 'COMPLETED'), ($5, $8, 'Radio active', 'IN_PROGRESS'), ($6, $8, 'Social cancelled', 'CANCELLED')`,
      [id(51), id(52), id(53), id(54), id(55), id(56), id(31), id(32)],
    );
    await db.query(
      `INSERT INTO campaign_activities (campaign_id, name, status)
       VALUES ($1, 'Ordinary activity without promotion extension', 'PLANNED'),
              ($2, 'Only cancelled work', 'CANCELLED')`,
      [id(32), id(33)],
    );
    await db.query(
      `INSERT INTO promotion_activities (campaign_activity_id, campaign_id, channel)
      VALUES ($1, $4, 'RADIO_PROMOTION'), ($2, $4, 'RADIO_PROMOTION'), ($3, $4, 'SOCIAL_MEDIA')`,
      [id(54), id(55), id(56), id(32)],
    );

    expect(await query("task_cohort", [FROM, TO, AS_OF])).toEqual([
      { total: 5, completed: 3, pending: 2, overdue: 1, percent: 60 },
    ]);
    const department = [FROM, TO, AS_OF, [id(1), id(3)], 25, 0];
    expect(await query("department_cohort", department)).toEqual([
      {
        id: id(1),
        total: 2,
        completed: 1,
        pending: 1,
        overdue: 1,
        percent: 50,
      },
      {
        id: id(3),
        total: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        percent: null,
      },
    ]);
    expect(
      await query("department_cohort", [FROM, TO, AS_OF, [], 25, 0]),
    ).toEqual([]);
    expect(
      await query("department_cohort", [FROM, TO, AS_OF, [id(1), id(2)], 1, 1]),
    ).toEqual([
      {
        id: id(2),
        total: 2,
        completed: 1,
        pending: 1,
        overdue: 0,
        percent: 50,
      },
    ]);
    expect(
      await query("employee_cohort", [
        FROM,
        TO,
        AS_OF,
        [id(11), id(12), id(13)],
        25,
        0,
      ]),
    ).toEqual([
      {
        id: id(11),
        total: 2,
        completed: 1,
        pending: 1,
        overdue: 1,
        percent: 50,
      },
      {
        id: id(12),
        total: 1,
        completed: 1,
        pending: 0,
        overdue: 0,
        percent: 100,
      },
      {
        id: id(13),
        total: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        percent: null,
      },
    ]);
    expect(await query("event_progress", [[id(21)], 25, 0])).toEqual([
      { workspace_id: id(21), total: 3, completed: 1, percent: 33 },
    ]);
    expect(
      await query("campaign_progress", [[id(31), id(32), id(33)], 25, 0]),
    ).toEqual([
      { id: id(31), total: 2, completed: 1, percent: 50 },
      { id: id(32), total: 3, completed: 1, percent: 33 },
      { id: id(33), total: 0, completed: 0, percent: null },
    ]);
    expect(await query("promotion_delivery", [[id(32)]])).toEqual([
      { channel: "RADIO_PROMOTION", total: 2, completed: 1, percent: 50 },
    ]);
    for (const name of [
      "employee_cohort",
      "event_progress",
      "campaign_progress",
      "promotion_delivery",
    ]) {
      const values =
        name === "employee_cohort"
          ? [FROM, TO, AS_OF, [], 25, 0]
          : name === "promotion_delivery"
            ? [[]]
            : [[], 25, 0];
      expect(await query(name, values)).toEqual([]);
    }
    expect(
      await query("monthly_completion", [FROM, "2026-11-01T00:00:00Z"]),
    ).toEqual([
      { month: "2026-09", completed: 2 },
      { month: "2026-10", completed: 1 },
    ]);
    const monthly = await query("monthly_creation", [
      FROM,
      "2026-11-01T00:00:00Z",
    ]);
    expect(monthly).toHaveLength(10);
    expect(monthly).toContainEqual({
      month: "2026-09",
      kind: "task",
      total: 6,
    });
    expect(monthly).toContainEqual({
      month: "2026-10",
      kind: "task",
      total: 1,
    });
    expect(monthly).toContainEqual({
      month: "2026-09",
      kind: "campaign",
      total: 3,
    });
    expect(monthly).toContainEqual({
      month: "2026-10",
      kind: "project",
      total: 0,
    });
    expect(
      await query("task_cohort", ["2020-01-01", "2020-02-01", AS_OF]),
    ).toEqual([
      { total: 0, completed: 0, pending: 0, overdue: 0, percent: null },
    ]);
    const timezoneClient = new Client({ connectionString: db.url });
    await timezoneClient.connect();
    try {
      await timezoneClient.query("SET TIME ZONE 'Pacific/Auckland'");
      const result = await timezoneClient.query(sql.monthly_completion!, [
        FROM,
        "2026-11-01T00:00:00Z",
      ]);
      expect(result.rows).toEqual([
        { month: "2026-09", completed: 2 },
        { month: "2026-10", completed: 1 },
      ]);
    } finally {
      await timezoneClient.end();
    }
  });

  it("measures representative PostgreSQL plans against the existing warm-read budget", async () => {
    await db.reset();
    await db.query(`INSERT INTO departments (id, name)
      SELECT md5('department' || g)::uuid, 'Department ' || g FROM generate_series(1, 100) g;
      INSERT INTO users (id, email)
      SELECT md5('user' || g)::uuid, 'employee' || g || '@test.invalid' FROM generate_series(1, 1000) g;
      INSERT INTO workspaces (id, kind)
      SELECT md5('event-workspace' || g)::uuid, 'EVENT' FROM generate_series(1, 50) g;
      INSERT INTO events (workspace_id, name, event_type, created_at)
      SELECT id, 'Event', 'CONCERT', '2026-09-01' FROM workspaces WHERE kind = 'EVENT';
      INSERT INTO workspaces (id, kind)
      SELECT md5('campaign-workspace' || g)::uuid, 'CAMPAIGN' FROM generate_series(1, 100) g;
      INSERT INTO campaigns (id, workspace_id, name, campaign_type, created_at)
      SELECT md5('campaign' || g)::uuid, md5('campaign-workspace' || g)::uuid, 'Campaign',
        (CASE WHEN g % 2 = 0 THEN 'MARKETING' ELSE 'PROMOTION' END)::campaign_type, '2026-09-01'
      FROM generate_series(1, 100) g;
      INSERT INTO workspaces (id, kind)
      SELECT md5('project-workspace' || g)::uuid, 'PROJECT' FROM generate_series(1, 500) g;
      INSERT INTO projects (workspace_id, name, created_at)
      SELECT md5('project-workspace' || g)::uuid, 'Project', '2026-09-01' FROM generate_series(1, 500) g;
      INSERT INTO workspaces (id, kind)
      SELECT md5('production-workspace' || g)::uuid, 'PRODUCTION' FROM generate_series(1, 500) g;
      INSERT INTO productions (workspace_id, name, production_type, created_at)
      SELECT md5('production-workspace' || g)::uuid, 'Production', 'Video', '2026-09-01' FROM generate_series(1, 500) g;
      INSERT INTO tasks (id, department_id, workspace_id, title, status, created_at, due_at)
      SELECT md5('task' || g)::uuid, md5('department' || (g % 100 + 1))::uuid,
        md5('event-workspace' || (g % 50 + 1))::uuid, 'Task',
        (ARRAY['TODO','IN_PROGRESS','UNDER_REVIEW','BLOCKED','COMPLETED','CANCELLED'])[g % 6 + 1]::task_status,
        '2025-01-01'::timestamptz + (g % 730) * interval '1 day',
        CASE WHEN g % 7 = 0 THEN NULL ELSE '2026-09-15'::timestamptz END
      FROM generate_series(1, 100000) g;
      INSERT INTO task_assignments (task_id, user_id)
      SELECT md5('task' || g)::uuid, md5('user' || (g % 1000 + 1))::uuid FROM generate_series(1, 100000) g;
      INSERT INTO task_assignments (task_id, user_id)
      SELECT md5('task' || g)::uuid, md5('user' || ((g + 1) % 1000 + 1))::uuid FROM generate_series(1, 100000) g;
      INSERT INTO task_activities (task_id, type, details, occurred_at)
      SELECT md5('task' || g)::uuid, 'STATUS_CHANGED', '{"to":"COMPLETED"}',
        '2025-01-01'::timestamptz + (g % 730) * interval '1 day' FROM generate_series(1, 100000) g;
      INSERT INTO task_activities (task_id, type, details, occurred_at)
      SELECT md5('task' || g)::uuid, 'PROGRESS_UPDATED', '{"progress":25}',
        '2025-01-01'::timestamptz + (g % 730) * interval '1 day' FROM generate_series(1, 100000) g;
      INSERT INTO campaign_activities (id, campaign_id, name, status)
      SELECT md5('activity' || g)::uuid, md5('campaign' || (g % 100 + 1))::uuid, 'Activity',
        (ARRAY['PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'])[(g / 100) % 4 + 1]::campaign_activity_status
      FROM generate_series(1, 20000) g;
      INSERT INTO promotion_activities (campaign_activity_id, campaign_id, channel)
      SELECT a.id, a.campaign_id, 'RADIO_PROMOTION' FROM campaign_activities a
        JOIN campaigns c ON c.id = a.campaign_id WHERE c.campaign_type = 'PROMOTION';
      ANALYZE tasks; ANALYZE departments; ANALYZE users; ANALYZE workspaces;
      ANALYZE events; ANALYZE campaigns; ANALYZE campaign_activities;
      ANALYZE projects; ANALYZE productions;
      ANALYZE promotion_activities; ANALYZE task_assignments; ANALYZE task_activities;`);
    const departments = (
      await db.query<{ id: string }>("SELECT id FROM departments ORDER BY id")
    ).map((row) => row.id);
    const users = (
      await db.query<{ id: string }>(
        "SELECT id FROM users ORDER BY id LIMIT 100",
      )
    ).map((row) => row.id);
    const workspaces = (
      await db.query<{ id: string }>(
        "SELECT id FROM workspaces WHERE kind = 'EVENT' ORDER BY id",
      )
    ).map((row) => row.id);
    const campaigns = (
      await db.query<{ id: string }>("SELECT id FROM campaigns ORDER BY id")
    ).map((row) => row.id);
    const values: Record<string, unknown[]> = {
      task_cohort: [FROM, TO, AS_OF],
      department_cohort: [FROM, TO, AS_OF, departments, 100, 0],
      employee_cohort: [FROM, TO, AS_OF, users, 100, 0],
      event_progress: [workspaces, 100, 0],
      campaign_progress: [campaigns, 100, 0],
      promotion_delivery: [campaigns],
      monthly_creation: ["2026-01-01", "2027-01-01"],
      monthly_completion: ["2026-01-01", "2027-01-01"],
    };
    for (const [name, parameters] of Object.entries(values)) {
      const rows = await query(name, parameters); // Discard pool/cache warmup.
      expect(rows.length).toBeLessThanOrEqual(
        name === "monthly_creation" ? 60 : 100,
      );
      const samples: number[] = [];
      let representative: Explain | undefined;
      for (let sample = 0; sample < 20; sample += 1) {
        const [row] = await db.query<{ "QUERY PLAN": Explain[] }>(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql[name]}`,
          parameters,
        );
        representative = row!["QUERY PLAN"][0]!;
        samples.push(
          representative["Planning Time"] + representative["Execution Time"],
        );
      }
      const p95 = samples.toSorted((a, b) => a - b)[18]!;
      console.info(
        JSON.stringify({
          model: name,
          samples: samples.length,
          p95Ms: p95,
          resultRows: rows.length,
          sharedHitBlocks: representative!.Plan["Shared Hit Blocks"],
          sharedReadBlocks: representative!.Plan["Shared Read Blocks"],
          scans: [...new Set(scans(representative!.Plan))],
        }),
      );
      // The existing read target is 500 ms, hard release limit 750 ms.
      // Database-only samples must fit the target; this is not an API SLA claim.
      expect(
        p95,
        `${name} plan p95 exceeds the existing 500 ms read target`,
      ).toBeLessThanOrEqual(500);
    }
  }, 120_000);
});
