/**
 * OS-183: fresh empty-DB seed must mint an Access bootstrap key with
 * AGENT_API_KEY_SCOPES only — full API_KEY_SCOPES includes door-only scopes
 * that OS-182 correctly rejects.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import {
  AGENT_API_KEY_SCOPES,
  API_KEY_SCOPES,
  hasFullAccessApiKeyScopes,
} from "@backsteros/contracts";

import { db, sqlClient } from "../db/index.js";
import { apiKeys, workspaces } from "../db/schema.js";
import { createBootstrapApiKey } from "../services/api-keys.js";

after(async () => {
  await sqlClient.end();
});

test("OS-183: createBootstrapApiKey seeds a fresh workspace with Access scopes", async (context) => {
  const workspaceId = `ws-os183-${randomUUID().slice(0, 8)}`;

  context.after(async () => {
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });

  await assert.rejects(
    () => createBootstrapApiKey("bootstrap-bad", [...API_KEY_SCOPES], workspaceId),
    (error: unknown) =>
      error instanceof Error && error.message === "ACCESS_SCOPES_INVALID",
  );

  const { row, secret } = await createBootstrapApiKey(
    "bootstrap",
    [...AGENT_API_KEY_SCOPES],
    workspaceId,
  );

  assert.ok(secret.startsWith("sk_access_"));
  assert.equal(row.workspaceId, workspaceId);
  assert.equal(row.contactId, null);
  assert.equal(row.name, "bootstrap");
  assert.deepEqual(
    [...(row.scopes ?? [])].sort(),
    [...AGENT_API_KEY_SCOPES].sort(),
  );
  assert.equal(hasFullAccessApiKeyScopes(row.scopes ?? []), true);

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  assert.equal(workspace?.id, workspaceId);
});
