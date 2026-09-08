import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sqlite3 from "node:sqlite";

import { INBOX_TASKS_WHERE_SQL } from "./inbox-tasks-sql";

describe("INBOX_TASKS_WHERE_SQL", () => {
  it("compares due dates in localtime so local-midnight ISO dues stay out", () => {
    assert.match(INBOX_TASKS_WHERE_SQL, /date\(t\.due_date, 'localtime'\)/);
    assert.doesNotMatch(
      INBOX_TASKS_WHERE_SQL,
      /date\(t\.due_date\) < date\('now', 'localtime'\)/,
    );

    const db = new sqlite3.DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE tasks (
        id TEXT,
        deleted_at TEXT,
        habit_id TEXT,
        due_date TEXT,
        inbox INTEGER,
        status TEXT,
        inbox_updated_at TEXT,
        agent_created_at TEXT,
        agent_inbox_approved_at TEXT
      );
    `);
    // Local midnight CEST = previous calendar day in UTC.
    db.prepare(
      `INSERT INTO tasks (id, deleted_at, habit_id, due_date, inbox, status)
       VALUES ('today-local', NULL, NULL, '2026-09-05T22:00:00.000Z', 1, 'triage')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, deleted_at, habit_id, due_date, inbox, status)
       VALUES ('undated', NULL, NULL, NULL, 1, 'triage')`,
    ).run();

    // Pin "now" by rewriting the clause for the test clock.
    const sql = INBOX_TASKS_WHERE_SQL.replaceAll(
      "date('now', 'localtime')",
      "date('2026-09-06')",
    );
    const rows = db
      .prepare(`SELECT id FROM tasks t WHERE ${sql} ORDER BY id`)
      .all() as Array<{ id: string }>;
    assert.deepEqual(
      rows.map((row) => row.id),
      ["undated"],
    );
  });
});
