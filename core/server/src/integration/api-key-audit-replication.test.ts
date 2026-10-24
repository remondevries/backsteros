import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  apiKeyAuditLogs,
  apiKeys,
  users,
  workspaces,
} from "../db/schema.js";
import { applyRemoteChanges } from "../services/core-replication/apply.js";
import { countLocalChangesSince } from "../services/core-replication/fetch.js";
import { REPLICATED_TABLES } from "../services/core-replication/constants.js";
import { getTableSpec } from "../services/core-replication/tables.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

test("api_key_audit_logs is replicated insert-only and idempotent by id", async (context) => {
  assert.ok(REPLICATED_TABLES.includes("api_key_audit_logs"));
  const spec = getTableSpec("api_key_audit_logs");
  assert.ok(spec);
  assert.equal(spec.updatedAtColumn, "created_at");

  const userId = id("user");
  const workspaceId = id("workspace");
  const keyId = id("key");
  const auditId = id("audit");
  const createdAt = new Date().toISOString();

  context.after(async () => {
    await db.delete(apiKeyAuditLogs).where(eq(apiKeyAuditLogs.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await sqlClient.end();
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `audit-repl-${randomUUID()}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Audit replication",
    slug: id("audit-repl"),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: keyId,
    workspaceId,
    userId,
    name: "replicated-key",
    prefix: "sk_live_audit",
    keyHash: `hash-${randomUUID()}`,
    scopes: ["tasks:read"],
  });

  const row = {
    id: auditId,
    workspace_id: workspaceId,
    api_key_id: keyId,
    api_key_name: "replicated-key",
    action: "created",
    actor_user_id: userId,
    actor_kind: "api_key",
    actor_api_key_id: null,
    address: "198.51.100.10",
    created_at: createdAt,
  };

  const first = await applyRemoteChanges("api_key_audit_logs", [
    { table: "api_key_audit_logs", row },
  ]);
  assert.equal(first.applied, 1);
  assert.equal(first.skipped, 0);

  const second = await applyRemoteChanges("api_key_audit_logs", [
    {
      table: "api_key_audit_logs",
      row: { ...row, action: "rotated", address: "spoofed" },
    },
  ]);
  assert.equal(second.applied, 0);
  assert.equal(second.skipped, 1);

  const [stored] = await db
    .select()
    .from(apiKeyAuditLogs)
    .where(eq(apiKeyAuditLogs.id, auditId))
    .limit(1);
  assert.ok(stored);
  assert.equal(stored.action, "created");
  assert.equal(stored.address, "198.51.100.10");

  // Existing local rows are visible on the push outbox from epoch (backfill).
  const pending = await countLocalChangesSince("api_key_audit_logs", {
    updatedAt: new Date(0).toISOString(),
    rowId: "",
  });
  assert.ok(pending >= 1);
});
