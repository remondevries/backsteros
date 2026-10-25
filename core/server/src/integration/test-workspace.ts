import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { API_KEY_SCOPES } from "@backsteros/contracts";

import { createApp } from "../app.js";
import { db } from "../db/index.js";
import { apiKeys, syncEvents, users, workspaces } from "../db/schema.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";

export const testId = (prefix: string) => `${prefix}-${randomUUID()}`;

export type TestResponse = {
  status: number;
  body: Record<string, unknown> | null;
};

/**
 * Isolated workspace + full-scope API key for route-level integration tests.
 * `cleanup()` deletes the workspace (rows cascade) and the owning user.
 */
export async function createTestWorkspace(label: string) {
  const app = createApp();
  const userId = testId("user");
  const workspaceId = testId("workspace");
  const secret = `sk_live_${randomUUID().replaceAll("-", "")}`;

  await db.insert(users).values({
    id: userId,
    clerkId: testId("clerk"),
    email: `${label}-${randomUUID()}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: label,
    slug: testId(label),
    ownerUserId: userId,
  });
  await db.insert(apiKeys).values({
    id: testId("key"),
    workspaceId,
    userId,
    name: label,
    prefix: apiKeyLookupPrefix(secret),
    keyHash: hashApiKey(secret),
    scopes: [...API_KEY_SCOPES],
  });

  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<TestResponse> {
    const response = await app.request(path, {
      method,
      headers: {
        authorization: `Bearer ${secret}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
    };
  }

  async function syncOperations(entity: string, entityId: string) {
    const rows = await db
      .select({ operation: syncEvents.operation })
      .from(syncEvents)
      .where(
        and(
          eq(syncEvents.workspaceId, workspaceId),
          eq(syncEvents.entity, entity),
          eq(syncEvents.entityId, entityId),
        ),
      )
      .orderBy(syncEvents.cursor);
    return rows.map((row) => row.operation);
  }

  async function cleanup() {
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  }

  return { app, workspaceId, call, syncOperations, cleanup };
}
