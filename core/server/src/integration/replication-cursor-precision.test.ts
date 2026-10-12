import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { users, workspaces } from "../db/schema.js";
import {
  getReplicationCursor,
  setReplicationCursor,
} from "../services/core-replication/cursors.js";
import { countLocalChangesSince } from "../services/core-replication/fetch.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

test("OS-110: setReplicationCursor keeps µs so tip row does not count as unpushed", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  // Postgres timestamptz with microseconds beyond JS Date milliseconds.
  const tipIso = "2026-10-12T11:41:09.052205Z";
  const truncatedIso = "2026-10-12T11:41:09.052Z";

  context.after(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient`
      DELETE FROM core_replication_cursors WHERE table_name = ${"workspaces"}
    `;
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `cursor-precision-${userId}@example.test`,
  });

  await sqlClient`
    INSERT INTO workspaces (id, name, slug, owner_user_id, updated_at, created_at)
    VALUES (
      ${workspaceId},
      ${"Cursor precision WS"},
      ${id("slug")},
      ${userId},
      ${tipIso}::timestamptz,
      ${tipIso}::timestamptz
    )
  `;

  // Simulate the old bug: a ms-truncated cursor pointing at this tip row would
  // make countLocalChangesSince return 1 forever.
  await sqlClient`
    INSERT INTO core_replication_cursors (
      table_name, updated_at, row_id,
      pull_updated_at, pull_row_id,
      push_updated_at, push_row_id
    ) VALUES (
      ${"workspaces"},
      ${truncatedIso}::timestamptz,
      ${workspaceId},
      ${truncatedIso}::timestamptz,
      ${workspaceId},
      ${truncatedIso}::timestamptz,
      ${workspaceId}
    )
    ON CONFLICT (table_name) DO UPDATE SET
      push_updated_at = EXCLUDED.push_updated_at,
      push_row_id = EXCLUDED.push_row_id,
      updated_at = EXCLUDED.updated_at,
      row_id = EXCLUDED.row_id
  `;

  const truncatedCursor = await getReplicationCursor("workspaces", "push");
  assert.equal(truncatedCursor.rowId, workspaceId);
  assert.ok(
    truncatedCursor.updatedAt.startsWith("2026-10-12T11:41:09.052"),
    `expected ms-truncated cursor, got ${truncatedCursor.updatedAt}`,
  );
  assert.ok(
    (await countLocalChangesSince("workspaces", truncatedCursor)) >= 1,
    "truncated cursor must still see the µs tip as ahead (documents the bug)",
  );

  // Setting the cursor from the tip row must store full microseconds.
  await setReplicationCursor(
    "workspaces",
    { updatedAt: tipIso, rowId: workspaceId },
    "push",
  );
  const stored = await getReplicationCursor("workspaces", "push");
  assert.equal(stored.rowId, workspaceId);
  assert.equal(
    stored.updatedAt,
    tipIso,
    `cursor must keep microseconds, got ${stored.updatedAt}`,
  );
  assert.equal(
    await countLocalChangesSince("workspaces", stored),
    0,
    "row at .052205 with cursor set from that row must count as 0",
  );
});
