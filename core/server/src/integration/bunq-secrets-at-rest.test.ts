/**
 * H2 integration — bunq secrets encrypted in place; replication feed strips
 * bunq_*; clearLocalBunqSecrets nulls them. backsteros_test only, no bunq HTTP.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { users, workspaceIntegrationSecrets, workspaces } from "../db/schema.js";
import { fetchLocalRowsByKeys } from "../services/core-replication/reconcile.js";
import { fetchLocalChanges } from "../services/core-replication/fetch.js";
import {
  clearLocalBunqSecrets,
} from "../services/bunq-local-secrets.js";
import {
  encryptLegacyBunqSecrets,
  getBunqSettings,
  updateBunqSettings,
} from "../services/bunq-settings.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY =
  process.env.BACKSTEROS_SECRET_ENCRYPTION_KEY?.trim() ||
  "h2-integration-encryption-key";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

test("H2: bunq secrets are encrypted at rest, stripped from replication, and clearable", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  context.after(async () => {
    await db
      .delete(workspaceIntegrationSecrets)
      .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });
  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `h2-${randomUUID()}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "bunq at rest",
    slug: id("bunq-rest"),
    ownerUserId: userId,
  });

  const plaintextKey = `sandbox_${randomUUID().replaceAll("-", "")}`;
  const settings = await updateBunqSettings(workspaceId, {
    environment: "sandbox",
    apiKey: plaintextKey,
    permittedIps: ["203.0.113.7"],
  });
  assert.equal(settings.apiKeyConfigured, true);
  assert.equal(settings.apiKeyPreview?.includes(plaintextKey), false);

  const [raw] = await db
    .select()
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  assert.ok(raw?.bunqApiKey?.startsWith("v1:"), "stored as v1: ciphertext");
  assert.equal(raw?.bunqApiKey?.includes(plaintextKey), false);

  // Legacy plaintext reads fine and is upgraded in place.
  await db
    .update(workspaceIntegrationSecrets)
    .set({ bunqApiKey: plaintextKey })
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
  assert.equal((await getBunqSettings(workspaceId)).apiKeyConfigured, true);
  assert.equal(await encryptLegacyBunqSecrets(workspaceId), 1);
  const [upgraded] = await db
    .select({ key: workspaceIntegrationSecrets.bunqApiKey })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  assert.ok(upgraded?.key?.startsWith("v1:"));
  assert.equal(await encryptLegacyBunqSecrets(workspaceId), 0);

  // Outbound replication never carries bunq_* (both feeds).
  const feed = await fetchLocalChanges("workspace_integration_secrets", {
    updatedAt: "1970-01-01T00:00:00.000Z",
    rowId: "",
  });
  const mine = feed.changes.find((c) => c.row.workspace_id === workspaceId);
  assert.ok(mine, "row is in the feed");
  assert.equal(Object.keys(mine.row).some((k) => k.startsWith("bunq_")), false);
  const byKey = await fetchLocalRowsByKeys("workspace_integration_secrets", [
    workspaceId,
  ]);
  assert.equal(byKey.length, 1);
  assert.equal(
    Object.keys(byKey[0]!.row).some((k) => k.startsWith("bunq_")),
    false,
  );

  // clearLocalBunqSecrets: dry-run counts, apply nulls.
  // The guard needs a positively-local env (role=local + loopback DB); the
  // test DB is Docker Postgres on loopback, so assert that explicitly.
  const localEnv = {
    CORE_REPLICATION_ROLE: "local",
    DATABASE_URL: "postgresql://backsteros@127.0.0.1:5433/backsteros_test",
  } as NodeJS.ProcessEnv;
  const dry = await clearLocalBunqSecrets({ workspaceId }, { env: localEnv });
  assert.deepEqual(dry, { dryRun: true, affectedRows: 1 });
  const applied = await clearLocalBunqSecrets(
    { workspaceId, dryRun: false },
    { env: localEnv },
  );
  assert.deepEqual(applied, { dryRun: false, affectedRows: 1 });
  const [cleared] = await db
    .select()
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  assert.equal(cleared?.bunqApiKey, null);
  assert.equal(cleared?.bunqSigningPrivateKeyPem, null);
  assert.deepEqual(cleared?.bunqPermittedIps, []);
  assert.equal((await getBunqSettings(workspaceId)).apiKeyConfigured, false);
});
