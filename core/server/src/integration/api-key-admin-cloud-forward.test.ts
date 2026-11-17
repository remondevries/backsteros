/**
 * OS-181 round 11: route-level cloud forward, local mirror auth, Mac-only revoke,
 * and cloud non-owner rejection.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { createApp } from "../app.js";
import { db, sqlClient } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  generateApiKeySecret,
  hashApiKey,
} from "../lib/crypto.js";
import {
  KEY_ADMIN_BEARER_MARKER,
  keyAdminAuthHeaderRecord,
} from "../lib/api-key-admin-forward-auth.js";
import { authenticateApiKey } from "../middleware/auth.js";
import { mirrorCloudMintedApiKeyLocally } from "../services/api-key-admin-local-mirror.js";
import {
  authenticateKeyAdminForward,
  handleCloudApiKeyCreate,
} from "../services/api-key-admin-cloud.js";
import { resolveLocalShellOwner } from "../services/local-shell-auth.js";

const ADMIN = "round11-admin-secret-32-bytes!!!";
const REPL = "round11-repl-secret-not-admin!!!!";

after(async () => {
  await sqlClient.end();
});

test("OS-181 B1: mirrorCloudMintedApiKeyLocally inserts and authenticates immediately", async (context) => {
  const owner = await resolveLocalShellOwner();
  const secret = generateApiKeySecret();
  const keyId = `mirror-${randomUUID()}`;
  context.after(async () => {
    await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
  });

  const result = await mirrorCloudMintedApiKeyLocally({
    apiKey: {
      id: keyId,
      workspaceId: owner.workspaceId,
      userId: owner.userId,
      name: "mirror-probe",
      prefix: apiKeyLookupPrefix(secret),
      scopes: ["tasks:read"],
    },
    secret,
  });
  assert.equal(result, "inserted");

  const [row] = await db
    .select({
      keyHash: apiKeys.keyHash,
      workspaceId: apiKeys.workspaceId,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  assert.ok(row);
  assert.equal(row.workspaceId, owner.workspaceId);
  assert.equal(row.keyHash, hashApiKey(secret));
  assert.equal(row.revokedAt, null);

  const auth = await authenticateApiKey(secret);
  assert.ok(auth);
  assert.equal(auth.apiKeyId, keyId);
  assert.equal(auth.workspaceId, owner.workspaceId);
});

test("OS-181 route forward: create mirrors locally; Mac-only revoke; migrate-first on rotate", async (context) => {
  const app = createApp();
  const owner = await resolveLocalShellOwner();
  const previous = {
    role: process.env.CORE_REPLICATION_ROLE,
    peer: process.env.CORE_REPLICATION_PEER_URL,
    secret: process.env.CORE_REPLICATION_SECRET,
    admin: process.env.CORE_KEY_ADMIN_SECRET,
  };
  const originalFetch = globalThis.fetch;
  const mintedIds: string[] = [];
  const macOnlyId = `mac-only-${randomUUID()}`;
  const macOnlySecret = generateApiKeySecret();

  process.env.CORE_REPLICATION_ROLE = "local";
  process.env.CORE_REPLICATION_PEER_URL = "http://cloud.test:8788";
  process.env.CORE_REPLICATION_SECRET = REPL;
  process.env.CORE_KEY_ADMIN_SECRET = ADMIN;

  await db.insert(apiKeys).values({
    id: macOnlyId,
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    name: "mac-only-cli",
    prefix: apiKeyLookupPrefix(macOnlySecret),
    keyHash: hashApiKey(macOnlySecret),
    scopes: ["tasks:read"],
  });

  context.after(async () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ["CORE_REPLICATION_ROLE", previous.role],
      ["CORE_REPLICATION_PEER_URL", previous.peer],
      ["CORE_REPLICATION_SECRET", previous.secret],
      ["CORE_KEY_ADMIN_SECRET", previous.admin],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const id of [...mintedIds, macOnlyId]) {
      await db.delete(apiKeys).where(eq(apiKeys.id, id));
    }
  });

  const cloudCreateSecret = generateApiKeySecret();
  const cloudCreateId = `cloud-mint-${randomUUID()}`;

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), `Bearer ${KEY_ADMIN_BEARER_MARKER}`);
    assert.ok(headers.get("x-backsteros-key-admin-signature"));

    if (method === "POST" && url.endsWith("/internal/core-replication/api-keys")) {
      return new Response(
        JSON.stringify({
          apiKey: {
            id: cloudCreateId,
            name: "forwarded-create",
            prefix: apiKeyLookupPrefix(cloudCreateSecret),
            scopes: ["tasks:read"],
            contactId: null,
            createdAt: new Date().toISOString(),
            revokedAt: null,
            hasRecoverableSecret: true,
            // intentionally omit workspaceId/userId like toApiKey
          },
          secret: cloudCreateSecret,
        }),
        { status: 201 },
      );
    }
    if (url.includes(`/api-keys/${encodeURIComponent(macOnlyId)}/rotate`)) {
      return new Response(JSON.stringify({ error: "not found", code: "not_found" }), {
        status: 404,
      });
    }
    if (url.includes(`/api-keys/${encodeURIComponent(macOnlyId)}/revoke`)) {
      return new Response(JSON.stringify({ error: "not found", code: "not_found" }), {
        status: 404,
      });
    }
    if (url.includes(`/api-keys/${encodeURIComponent(cloudCreateId)}/revoke`)) {
      return new Response(
        JSON.stringify({
          id: cloudCreateId,
          name: "forwarded-create",
          scopes: ["tasks:read"],
          revokedAt: new Date().toISOString(),
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error: `unexpected ${method} ${url}` }), {
      status: 500,
    });
  }) as typeof fetch;

  const shell = { authorization: "Bearer local" };

  const created = await app.request("/api/v1/api-keys", {
    method: "POST",
    headers: { ...shell, "content-type": "application/json" },
    body: JSON.stringify({
      name: "forwarded-create",
      kind: "access",
      scopes: ["tasks:read"],
    }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const createdBody = (await created.json()) as {
    apiKey: { id: string };
    secret: string;
    localMirrorWarning?: string;
  };
  mintedIds.push(createdBody.apiKey.id);
  assert.equal(createdBody.apiKey.id, cloudCreateId);
  assert.equal(createdBody.secret, cloudCreateSecret);
  assert.equal(createdBody.localMirrorWarning, undefined);

  const auth = await authenticateApiKey(cloudCreateSecret);
  assert.ok(auth, "mirrored key must authenticate on local immediately");
  assert.equal(auth.apiKeyId, cloudCreateId);

  const [mirrored] = await db
    .select({ workspaceId: apiKeys.workspaceId, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, cloudCreateId))
    .limit(1);
  assert.equal(mirrored?.workspaceId, owner.workspaceId);
  assert.equal(mirrored?.revokedAt, null);

  const rotateMacOnly = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(macOnlyId)}/rotate`,
    { method: "POST", headers: shell },
  );
  assert.equal(rotateMacOnly.status, 409);
  const rotateBody = (await rotateMacOnly.json()) as { code?: string };
  assert.equal(rotateBody.code, "api_key_mac_only_migrate_first");

  const revokeMacOnly = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(macOnlyId)}`,
    { method: "DELETE", headers: shell },
  );
  assert.equal(revokeMacOnly.status, 204);
  const [macRow] = await db
    .select({ revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, macOnlyId))
    .limit(1);
  assert.ok(macRow?.revokedAt);

  const revokeCloud = await app.request(
    `/api/v1/api-keys/${encodeURIComponent(cloudCreateId)}`,
    { method: "DELETE", headers: shell },
  );
  assert.equal(revokeCloud.status, 204);
  const [cloudLocal] = await db
    .select({ revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, cloudCreateId))
    .limit(1);
  assert.ok(cloudLocal?.revokedAt, "local copy revoked immediately after cloud revoke");
  assert.equal(await authenticateApiKey(cloudCreateSecret), null);
});

test("OS-181 cloud non-owner rejected on forwarded create", async () => {
  const owner = await resolveLocalShellOwner();
  const previous = {
    role: process.env.CORE_REPLICATION_ROLE,
    peer: process.env.CORE_REPLICATION_PEER_URL,
    secret: process.env.CORE_REPLICATION_SECRET,
    admin: process.env.CORE_KEY_ADMIN_SECRET,
  };
  process.env.CORE_REPLICATION_ROLE = "cloud";
  process.env.CORE_REPLICATION_PEER_URL = "http://127.0.0.1:8788";
  process.env.CORE_REPLICATION_SECRET = REPL;
  process.env.CORE_KEY_ADMIN_SECRET = ADMIN;

  try {
    const body = JSON.stringify({
      name: "nope",
      kind: "access",
      scopes: ["tasks:read"],
    });
    const path = "/internal/core-replication/api-keys";
    const headers = keyAdminAuthHeaderRecord({
      secret: ADMIN,
      method: "POST",
      path,
      userId: `not-owner-${randomUUID()}`,
      workspaceId: owner.workspaceId,
      body,
      timestampMs: Date.now(),
    });
    const headerMap = new Map(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const auth = authenticateKeyAdminForward({
      authorization: headers.Authorization,
      method: "POST",
      path,
      bodyText: body,
      headerGet: (name) => headerMap.get(name.toLowerCase()),
    });
    assert.equal(auth.ok, true);
    if (!auth.ok) return;

    const result = await handleCloudApiKeyCreate({
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      json: JSON.parse(body),
    });
    assert.equal(result.status, 403);
    assert.match(
      String((result.body as { error?: string }).error),
      /workspace owner/i,
    );

    // sanity: owner still allowed by auth layer (do not actually mint)
    const ownerHeaders = keyAdminAuthHeaderRecord({
      secret: ADMIN,
      method: "POST",
      path,
      userId: owner.userId,
      workspaceId: owner.workspaceId,
      body,
    });
    const ownerMap = new Map(
      Object.entries(ownerHeaders).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const ownerAuth = authenticateKeyAdminForward({
      authorization: ownerHeaders.Authorization,
      method: "POST",
      path,
      bodyText: body,
      headerGet: (name) => ownerMap.get(name.toLowerCase()),
    });
    assert.equal(ownerAuth.ok, true);
  } finally {
    for (const [key, value] of [
      ["CORE_REPLICATION_ROLE", previous.role],
      ["CORE_REPLICATION_PEER_URL", previous.peer],
      ["CORE_REPLICATION_SECRET", previous.secret],
      ["CORE_KEY_ADMIN_SECRET", previous.admin],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
