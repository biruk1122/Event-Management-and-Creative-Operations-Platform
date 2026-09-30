import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createIsolatedDatabase,
  PG_ERROR,
  type IsolatedDatabase,
} from "./support/database.js";

describe("reporting schema", () => {
  let db: IsolatedDatabase;

  beforeAll(async () => {
    db = await createIsolatedDatabase();
  });
  afterAll(async () => {
    await db?.drop();
  });

  async function user() {
    const [row] = await db.query<{ id: string }>(
      "INSERT INTO users (email) VALUES ($1) RETURNING id",
      [`report-${randomUUID()}@example.test`],
    );
    return row!.id;
  }

  async function report(
    authorId: string,
    type: string,
    start: string,
    end: string,
  ) {
    const [row] = await db.query<{ id: string; status: string }>(
      `INSERT INTO reports (author_id, type, title, period_start, period_end)
       VALUES ($1, $2, 'Work summary', $3, $4) RETURNING id, status`,
      [authorId, type, start, end],
    );
    return row!;
  }

  it("deploys all migrations to a clean schema and reports them current", () => {
    const output = execSync("pnpm exec prisma migrate status", {
      cwd: resolve(import.meta.dirname, ".."),
      env: { ...process.env, DATABASE_URL: db.url },
      encoding: "utf8",
    });
    expect(output).toContain("Database schema is up to date");
  });

  it("stores all three calendar periods with UUID keys and explicit ownership", async () => {
    const authorId = await user();
    const [department] = await db.query<{ id: string }>(
      "INSERT INTO departments (name) VALUES ($1) RETURNING id",
      [`Reports ${randomUUID()}`],
    );
    const [workspace] = await db.query<{ id: string }>(
      "INSERT INTO workspaces (kind) VALUES ('PROJECT') RETURNING id",
    );
    const daily = await report(authorId, "DAILY", "2026-09-30", "2026-09-30");
    const weekly = await report(authorId, "WEEKLY", "2026-09-28", "2026-10-04");
    const monthly = await report(
      authorId,
      "MONTHLY",
      "2026-09-01",
      "2026-09-30",
    );
    expect([daily, weekly, monthly].map((row) => row.status)).toEqual([
      "DRAFT",
      "DRAFT",
      "DRAFT",
    ]);
    expect(daily.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    await db.query(
      `UPDATE reports SET department_id = $1, problems_encountered = 'None',
       next_day_plan = 'Prepare launch', updated_at = now() WHERE id = $2`,
      [department!.id, daily.id],
    );
    await db.query(
      "INSERT INTO report_workspaces (report_id, workspace_id) VALUES ($1, $2)",
      [daily.id, workspace!.id],
    );
    const linked = await db.query<{
      author_id: string;
      department_id: string;
      workspace_id: string;
    }>(
      `SELECT r.author_id, r.department_id, rw.workspace_id FROM reports r
       JOIN report_workspaces rw ON rw.report_id = r.id WHERE r.id = $1`,
      [daily.id],
    );
    expect(linked).toEqual([
      {
        author_id: authorId,
        department_id: department!.id,
        workspace_id: workspace!.id,
      },
    ]);
    await expect(
      db.query(
        "INSERT INTO report_workspaces (report_id, workspace_id) VALUES ($1, $2)",
        [daily.id, workspace!.id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    await expect(
      db.query("DELETE FROM users WHERE id = $1", [authorId]),
    ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    await expect(
      db.query("DELETE FROM workspaces WHERE id = $1", [workspace!.id]),
    ).rejects.toMatchObject({ code: PG_ERROR.restrictViolation });
    await db.query("DELETE FROM reports WHERE id = $1", [daily.id]);
    expect(
      await db.query(
        "SELECT report_id FROM report_workspaces WHERE report_id = $1",
        [daily.id],
      ),
    ).toHaveLength(0);
    expect(
      await db.query("SELECT id FROM workspaces WHERE id = $1", [
        workspace!.id,
      ]),
    ).toHaveLength(1);
  });

  it("rejects malformed periods, duplicate author periods, and invalid ownership", async () => {
    const authorId = await user();
    await report(authorId, "DAILY", "2026-10-01", "2026-10-01");
    await expect(
      report(authorId, "DAILY", "2026-10-01", "2026-10-01"),
    ).rejects.toMatchObject({ code: PG_ERROR.uniqueViolation });
    await expect(
      report(authorId, "DAILY", "2026-10-02", "2026-10-03"),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      report(authorId, "WEEKLY", "2026-10-05", "2026-10-10"),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      report(authorId, "MONTHLY", "2026-10-02", "2026-10-31"),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      report(authorId, "MONTHLY", "2026-10-01", "2026-10-30"),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      report(authorId, "YEARLY", "2026-01-01", "2026-12-31"),
    ).rejects.toMatchObject({ code: PG_ERROR.invalidTextRepresentation });
    await expect(
      report(randomUUID(), "DAILY", "2026-10-04", "2026-10-04"),
    ).rejects.toMatchObject({ code: PG_ERROR.foreignKeyViolation });
    await expect(
      db.query("UPDATE reports SET title = '  ' WHERE author_id = $1", [
        authorId,
      ]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
  });

  it("enforces type-specific narrative sections and review timestamps", async () => {
    const authorId = await user();
    const reviewerId = await user();
    const daily = await report(authorId, "DAILY", "2026-10-07", "2026-10-07");
    await expect(
      db.query(
        "UPDATE reports SET next_week_plan = 'Wrong section' WHERE id = $1",
        [daily.id],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query("UPDATE reports SET next_day_plan = '  ' WHERE id = $1", [
        daily.id,
      ]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await expect(
      db.query("UPDATE reports SET status = 'SUBMITTED' WHERE id = $1", [
        daily.id,
      ]),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await db.query(
      `UPDATE reports SET status = 'SUBMITTED', submitted_at = '2026-10-07T12:00:00Z'
       WHERE id = $1`,
      [daily.id],
    );
    await expect(
      db.query(
        `UPDATE reports SET status = 'REVIEWED', reviewer_id = $2,
         reviewed_at = '2026-10-07T11:00:00Z' WHERE id = $1`,
        [daily.id, reviewerId],
      ),
    ).rejects.toMatchObject({ code: PG_ERROR.checkViolation });
    await db.query(
      `UPDATE reports SET status = 'CHANGES_REQUESTED', reviewer_id = $2,
       reviewed_at = '2026-10-07T13:00:00Z' WHERE id = $1`,
      [daily.id, reviewerId],
    );
    await db.query(
      `INSERT INTO report_reviews (report_id, reviewer_id, outcome, note)
       VALUES ($1, $2, 'CHANGES_REQUESTED', 'Clarify the next-day plan')`,
      [daily.id, reviewerId],
    );
    await db.query(
      `UPDATE reports SET status = 'DRAFT', submitted_at = NULL,
       reviewed_at = NULL, reviewer_id = NULL WHERE id = $1`,
      [daily.id],
    );
    expect(
      await db.query<{ outcome: string }>(
        "SELECT outcome FROM report_reviews WHERE report_id = $1",
        [daily.id],
      ),
    ).toEqual([{ outcome: "CHANGES_REQUESTED" }]);
  });

  it("offers indexed author, department, and workspace lookups", async () => {
    const client = new Client({ connectionString: db.url });
    await client.connect();
    try {
      await client.query(`SET search_path TO "${db.schema}"`);
      // Empty isolated tables favor sequential scans; disabling them here
      // demonstrates that each intended filter has a usable index path.
      await client.query("SET enable_seqscan TO off");
      const queries = [
        {
          sql: `SELECT id FROM reports WHERE author_id = $1 AND type = 'DAILY'
                ORDER BY period_start DESC, id DESC LIMIT 20`,
          index: /reports_author_id_type_period_start_(id_idx|key)/,
        },
        {
          sql: `SELECT id FROM reports WHERE department_id = $1 AND type = 'WEEKLY'
                ORDER BY period_start DESC, id DESC LIMIT 20`,
          index: /reports_department_id_type_period_start_id_idx/,
        },
        {
          sql: "SELECT report_id FROM report_workspaces WHERE workspace_id = $1",
          index: /report_workspaces_workspace_id_report_id_idx/,
        },
      ];
      for (const { sql, index } of queries) {
        const plan = await client.query<{ "QUERY PLAN": object }>(
          `EXPLAIN (FORMAT JSON) ${sql}`,
          [randomUUID()],
        );
        expect(JSON.stringify(plan.rows[0]?.["QUERY PLAN"])).toMatch(index);
      }
    } finally {
      await client.end();
    }
  });
});
