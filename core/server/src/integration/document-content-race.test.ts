/**
 * Postgres integration: concurrent document content saves via the real
 * `updateDocumentContent` path (real `FOR UPDATE` transaction + queries).
 *
 * One command (starts Docker Postgres + migrates via `integration.env`):
 *
 *   pnpm test:integration
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { documents, syncEvents, users, workspaces } from "../db/schema.js";
import { splitDocumentMarkdown } from "../lib/document-frontmatter.js";
import {
  checksumForContent,
  setVaultPathCache,
  snippetForContent,
} from "../lib/storage.js";
import { setDocumentContentSaveTestGate } from "../services/document-content-save-test-gate.js";
import { updateDocumentContent } from "../services/documents.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

const R2_ENV_KEYS = [
  "BACKSTEROS_R2_BUCKET",
  "BACKSTEROS_R2_ENDPOINT",
  "BACKSTEROS_R2_ACCESS_KEY_ID",
  "BACKSTEROS_R2_SECRET_ACCESS_KEY",
] as const;

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("real updateDocumentContent: concurrent same-ifMatch — one wins, loser never writes", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const documentId = id("doc");
  const storageKey = `integration-race/${documentId}.md`;
  const N = 11;
  const baseBody = "BASE_BODY";
  const bodyA = "CONCURRENT_BODY_A";
  const bodyB = "CONCURRENT_BODY_B";

  const previousVault = process.env.BACKSTEROS_VAULT_PATH;
  const savedR2: Partial<Record<(typeof R2_ENV_KEYS)[number], string | undefined>> =
    {};
  for (const key of R2_ENV_KEYS) {
    savedR2[key] = process.env[key];
    delete process.env[key];
  }

  const vaultRoot = await mkdtemp(path.join(tmpdir(), "bos-doc-race-"));
  setVaultPathCache(vaultRoot);
  process.env.BACKSTEROS_VAULT_PATH = vaultRoot;
  await mkdir(path.join(vaultRoot, "integration-race"), { recursive: true });
  await writeFile(path.join(vaultRoot, storageKey), baseBody, "utf8");

  context.after(async () => {
    setDocumentContentSaveTestGate(null);
    setVaultPathCache(previousVault?.trim() || null);
    if (previousVault === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
    else process.env.BACKSTEROS_VAULT_PATH = previousVault;
    for (const key of R2_ENV_KEYS) {
      if (savedR2[key] === undefined) delete process.env[key];
      else process.env[key] = savedR2[key];
    }
    await db.delete(syncEvents).where(eq(syncEvents.workspaceId, workspaceId));
    await db.delete(documents).where(eq(documents.id, documentId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await rm(vaultRoot, { recursive: true, force: true });
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "CAS race",
    slug: id("cas-race"),
    ownerUserId: userId,
  });
  await db.insert(documents).values({
    id: documentId,
    workspaceId,
    type: "knowledge",
    kind: "document",
    path: `race/${documentId}.md`,
    title: "CAS race",
    storageKey,
    contentType: "text/markdown; charset=utf-8",
    byteSize: Buffer.byteLength(baseBody, "utf8"),
    checksum: checksumForContent(baseBody),
    snippet: snippetForContent(baseBody),
    contentVersion: N,
    contentEtag: checksumForContent(baseBody).slice(0, 32),
  });

  const run = (content: string, ifMatchVersion: number) =>
    updateDocumentContent(workspaceId, documentId, {
      content,
      ifMatchVersion,
    }).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    );

  const [resultA, resultB] = await Promise.all([
    run(bodyA, N),
    run(bodyB, N),
  ]);

  const successes = [resultA, resultB].filter((r) => r.ok);
  const failures = [resultA, resultB].filter((r) => !r.ok);

  assert.equal(successes.length, 1, "exactly one save must succeed");
  assert.equal(failures.length, 1, "exactly one save must lose");
  assert.equal(failures[0]!.error.message, "CONTENT_VERSION_CONFLICT");

  // OS-26 may wrap the body with YAML front matter (docKey / audience).
  const winnerBody = resultA.ok ? bodyA : bodyB;
  const loserBody = winnerBody === bodyA ? bodyB : bodyA;
  assert.equal(successes[0]!.value!.contentVersion, N + 1);

  const onDisk = await readFile(path.join(vaultRoot, storageKey), "utf8");
  assert.equal(
    splitDocumentMarkdown(onDisk).body.trim(),
    winnerBody,
    "vault must match the winning save body",
  );
  assert.notEqual(splitDocumentMarkdown(onDisk).body.trim(), loserBody);
  assert.equal(
    successes[0]!.value!.checksum,
    checksumForContent(onDisk),
    "CAS result checksum must match vault bytes",
  );

  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.workspaceId, workspaceId), eq(documents.id, documentId)),
    )
    .limit(1);
  assert.ok(row);
  assert.equal(row.contentVersion, N + 1);
  assert.equal(row.checksum, checksumForContent(onDisk));
  assert.equal(row.byteSize, Buffer.byteLength(onDisk, "utf8"));
});

test("real updateDocumentContent: lock held through putObject — newer content wins", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const documentId = id("doc");
  const storageKey = `integration-race/${documentId}-window.md`;
  const N = 5;
  const baseBody = "BASE_WINDOW";
  const oldBody = "OLD_WINDOW_BODY";
  const newBody = "NEW_WINDOW_BODY";

  const previousVault = process.env.BACKSTEROS_VAULT_PATH;
  const savedR2: Partial<Record<(typeof R2_ENV_KEYS)[number], string | undefined>> =
    {};
  for (const key of R2_ENV_KEYS) {
    savedR2[key] = process.env[key];
    delete process.env[key];
  }

  const vaultRoot = await mkdtemp(path.join(tmpdir(), "bos-doc-window-"));
  setVaultPathCache(vaultRoot);
  process.env.BACKSTEROS_VAULT_PATH = vaultRoot;
  await mkdir(path.join(vaultRoot, "integration-race"), { recursive: true });
  await writeFile(path.join(vaultRoot, storageKey), baseBody, "utf8");

  context.after(async () => {
    setDocumentContentSaveTestGate(null);
    setVaultPathCache(previousVault?.trim() || null);
    if (previousVault === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
    else process.env.BACKSTEROS_VAULT_PATH = previousVault;
    for (const key of R2_ENV_KEYS) {
      if (savedR2[key] === undefined) delete process.env[key];
      else process.env[key] = savedR2[key];
    }
    await db.delete(syncEvents).where(eq(syncEvents.workspaceId, workspaceId));
    await db.delete(documents).where(eq(documents.id, documentId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await rm(vaultRoot, { recursive: true, force: true });
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "CAS window",
    slug: id("cas-window"),
    ownerUserId: userId,
  });
  await db.insert(documents).values({
    id: documentId,
    workspaceId,
    type: "knowledge",
    kind: "document",
    path: `race/${documentId}-window.md`,
    title: "CAS window",
    storageKey,
    contentType: "text/markdown; charset=utf-8",
    byteSize: Buffer.byteLength(baseBody, "utf8"),
    checksum: checksumForContent(baseBody),
    snippet: snippetForContent(baseBody),
    contentVersion: N,
    contentEtag: checksumForContent(baseBody).slice(0, 32),
  });

  const enteredLock = deferred();
  const releasePut = deferred();
  setDocumentContentSaveTestGate(async () => {
    enteredLock.resolve();
    await releasePut.promise;
  });

  const olderPromise = updateDocumentContent(workspaceId, documentId, {
    content: oldBody,
    ifMatchVersion: N,
  }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error : new Error(String(error)),
    }),
  );

  await enteredLock.promise;

  // Second save blocks on Postgres FOR UPDATE until older finishes putObject.
  const concurrentSameMatch = updateDocumentContent(workspaceId, documentId, {
    content: newBody,
    ifMatchVersion: N,
  }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error : new Error(String(error)),
    }),
  );

  // Still BASE on disk while older holds the lock mid-save.
  assert.equal(
    await readFile(path.join(vaultRoot, storageKey), "utf8"),
    baseBody,
  );

  releasePut.resolve();
  const olderResult = await olderPromise;
  assert.ok(olderResult.ok, "older save under lock must succeed");
  assert.equal(olderResult.value!.contentVersion, N + 1);

  const blockedResult = await concurrentSameMatch;
  assert.ok(!blockedResult.ok, "same ifMatch after lock wait must conflict");
  assert.equal(blockedResult.error.message, "CONTENT_VERSION_CONFLICT");

  setDocumentContentSaveTestGate(null);

  // Refreshed ifMatch — newer body wins and sticks.
  const newerResult = await updateDocumentContent(workspaceId, documentId, {
    content: newBody,
    ifMatchVersion: N + 1,
  });
  assert.ok(newerResult);
  assert.equal(newerResult.contentVersion, N + 2);
  const onDisk = await readFile(path.join(vaultRoot, storageKey), "utf8");
  assert.equal(
    splitDocumentMarkdown(onDisk).body.trim(),
    newBody,
    "newer content must win after the locked race",
  );

  const [row] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  assert.ok(row);
  assert.equal(row.contentVersion, N + 2);
  assert.equal(row.checksum, checksumForContent(onDisk));
});
