/**
 * Postgres integration: document FTS (OS-80) matches body-only hits from
 * document_search_index without object-storage reads, and keeps the index
 * updated on content write.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { documentSearchIndex, documents, users, workspaces } from "../db/schema.js";
import {
  checksumForContent,
  documentContentEtag,
  putObject,
  setVaultPathCache,
  snippetForContent,
} from "../lib/storage.js";
import {
  backfillDocumentSearchBodies,
  upsertDocumentSearchIndex,
} from "../services/document-search-index.js";
import { putDocumentProperties } from "../services/document-properties.js";
import {
  createDocument,
  retrieveDocuments,
  searchDocuments,
} from "../services/documents.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

const R2_ENV_KEYS = [
  "BACKSTEROS_R2_BUCKET",
  "BACKSTEROS_R2_ENDPOINT",
  "BACKSTEROS_R2_ACCESS_KEY_ID",
  "BACKSTEROS_R2_SECRET_ACCESS_KEY",
] as const;

after(async () => {
  await sqlClient.end();
});

test("OS-80 FTS retrieve finds body-only hits without storage and indexes writes", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const hiddenId = id("doc-body");
  const noiseId = id("doc-noise");
  const uniqueToken = `zxqbodyonly${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  context.after(async () => {
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "FTS",
    slug: id("fts"),
    ownerUserId: userId,
  });

  const hiddenBody = `# Hidden\nThis paragraph contains ${uniqueToken} only in the body.\n`;
  const noiseBody = `# Noise\nNothing relevant here.\n`;

  await db.insert(documents).values([
    {
      id: hiddenId,
      workspaceId,
      type: "knowledge",
      kind: "document",
      path: `fts/${hiddenId}.md`,
      title: "Unrelated title",
      storageKey: `fts/${hiddenId}.md`,
      contentType: "text/markdown; charset=utf-8",
      byteSize: Buffer.byteLength(hiddenBody, "utf8"),
      checksum: checksumForContent(hiddenBody),
      snippet: snippetForContent("Unrelated snippet"),
      contentVersion: 1,
      contentEtag: documentContentEtag(hiddenBody),
    },
    {
      id: noiseId,
      workspaceId,
      type: "knowledge",
      kind: "document",
      path: `fts/${noiseId}.md`,
      title: "Noise title",
      storageKey: `fts/${noiseId}.md`,
      contentType: "text/markdown; charset=utf-8",
      byteSize: Buffer.byteLength(noiseBody, "utf8"),
      checksum: checksumForContent(noiseBody),
      snippet: snippetForContent(noiseBody),
      contentVersion: 1,
      contentEtag: documentContentEtag(noiseBody),
    },
  ]);

  await upsertDocumentSearchIndex({
    documentId: hiddenId,
    workspaceId,
    searchBody: hiddenBody,
    contentEtag: documentContentEtag(hiddenBody),
  });
  await upsertDocumentSearchIndex({
    documentId: noiseId,
    workspaceId,
    searchBody: noiseBody,
    contentEtag: documentContentEtag(noiseBody),
  });

  const searchHits = await searchDocuments({
    workspaceId,
    q: uniqueToken,
    limit: 20,
  });
  assert.equal(searchHits.some((row) => row.id === hiddenId), true);
  assert.equal(searchHits.some((row) => row.id === noiseId), false);

  const retrieved = await retrieveDocuments({
    workspaceId,
    q: uniqueToken,
    candidateLimit: 100,
  });
  assert.ok(retrieved.results.some((hit) => hit.documentId === hiddenId));
  assert.equal(retrieved.timing.indexedBodies >= 1, true);
  assert.equal(retrieved.skipped, 0);

  const [indexRow] = await db
    .select()
    .from(documentSearchIndex)
    .where(eq(documentSearchIndex.documentId, hiddenId))
    .limit(1);
  assert.ok(indexRow);
  assert.ok(indexRow.searchBody?.includes(uniqueToken));
});

test("OS-80 retrieve stays at candidateLimit 100 and is fast on indexed bodies", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const uniqueToken = `zxqbench${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  context.after(async () => {
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "FTS bench",
    slug: id("fts-bench"),
    ownerUserId: userId,
  });

  const rows = Array.from({ length: 100 }, (_, i) => {
    const docId = id(`bench-${i}`);
    const body =
      i === 0
        ? `# Hit\ncommonmarker ${uniqueToken} in body only.\n`
        : `# Noise ${i}\ncommonmarker filler without the unique token.\n`;
    return {
      id: docId,
      workspaceId,
      type: "knowledge" as const,
      kind: "document" as const,
      path: `fts/${docId}.md`,
      title: `Bench ${i}`,
      storageKey: `fts/${docId}.md`,
      contentType: "text/markdown; charset=utf-8",
      byteSize: Buffer.byteLength(body, "utf8"),
      checksum: checksumForContent(body),
      snippet: snippetForContent(`Bench ${i}`),
      contentVersion: 1,
      contentEtag: documentContentEtag(body),
      body,
    };
  });

  await db.insert(documents).values(
    rows.map(({ body: _body, ...row }) => row),
  );
  for (const row of rows) {
    await upsertDocumentSearchIndex({
      documentId: row.id,
      workspaceId,
      searchBody: row.body,
      contentEtag: documentContentEtag(row.body),
    });
  }

  const cold = await retrieveDocuments({
    workspaceId,
    q: "commonmarker",
    candidateLimit: 100,
  });
  const warm = await retrieveDocuments({
    workspaceId,
    q: "commonmarker",
    candidateLimit: 100,
  });

  assert.equal(cold.results.some((hit) => hit.text.includes(uniqueToken)), true);
  assert.equal(cold.timing.indexedBodies, 100);
  assert.equal(warm.timing.indexedBodies, 100);
  console.log(
    JSON.stringify({
      os80Measure: {
        candidateLimit: 100,
        cold: cold.timing,
        warm: warm.timing,
        hits: { cold: cold.results.length, warm: warm.results.length },
      },
    }),
  );
});

test("OS-80 retrieve ignores a stale indexed body and returns vault content", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const documentId = id("doc-stale");
  const oldToken = `zxqold${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const newToken = `zxqnew${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const oldBody = `Old paragraph with ${oldToken}.\n`;
  const newBody = `New paragraph with ${newToken}.\n`;
  const storageKey = `fts/${documentId}.md`;

  const previousVault = process.env.BACKSTEROS_VAULT_PATH;
  const savedR2: Partial<Record<(typeof R2_ENV_KEYS)[number], string | undefined>> =
    {};
  for (const key of R2_ENV_KEYS) {
    savedR2[key] = process.env[key];
    delete process.env[key];
  }
  const vaultRoot = await mkdtemp(path.join(tmpdir(), "bos-fts-stale-"));
  setVaultPathCache(vaultRoot);
  process.env.BACKSTEROS_VAULT_PATH = vaultRoot;
  await putObject(storageKey, newBody);

  context.after(async () => {
    setVaultPathCache(previousVault?.trim() || null);
    if (previousVault === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
    else process.env.BACKSTEROS_VAULT_PATH = previousVault;
    for (const key of R2_ENV_KEYS) {
      if (savedR2[key] === undefined) delete process.env[key];
      else process.env[key] = savedR2[key];
    }
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
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
    name: "FTS stale",
    slug: id("fts-stale"),
    ownerUserId: userId,
  });
  await db.insert(documents).values({
    id: documentId,
    workspaceId,
    type: "knowledge",
    kind: "document",
    path: storageKey,
    title: "Stale index",
    storageKey,
    contentType: "text/markdown; charset=utf-8",
    byteSize: Buffer.byteLength(newBody, "utf8"),
    checksum: checksumForContent(newBody),
    snippet: snippetForContent("Stale index"),
    contentVersion: 2,
    contentEtag: documentContentEtag(newBody),
  });
  await upsertDocumentSearchIndex({
    documentId,
    workspaceId,
    searchBody: oldBody,
    contentEtag: documentContentEtag(oldBody),
  });

  const retrieved = await retrieveDocuments({
    workspaceId,
    q: "Stale",
    candidateLimit: 100,
  });
  assert.equal(retrieved.timing.indexedBodies, 0);
  assert.ok(
    retrieved.results.some((hit) => hit.text.includes(newToken)),
  );
  assert.equal(retrieved.results.some((hit) => hit.text.includes(oldToken)), false);
});

test("OS-80 oversized document save does not abort indexing", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const documentId = id("doc-huge");
  const uniqueToken = `zxqhuge${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  // 160k unique lexemes overflows Postgres' ~1MB tsvector without the 80k-char cap.
  const tokenCount = 160_000;
  const hugeBody = `${uniqueToken} ${Array.from({ length: tokenCount }, (_, i) => `w${i}`).join(" ")}`;

  context.after(async () => {
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "FTS huge",
    slug: id("fts-huge"),
    ownerUserId: userId,
  });
  await db.insert(documents).values({
    id: documentId,
    workspaceId,
    type: "knowledge",
    kind: "document",
    path: `fts/${documentId}.md`,
    title: "Huge",
    storageKey: `fts/${documentId}.md`,
    contentType: "text/markdown; charset=utf-8",
    byteSize: Buffer.byteLength(hugeBody, "utf8"),
    checksum: checksumForContent(hugeBody),
    snippet: snippetForContent("Huge"),
    contentVersion: 1,
    contentEtag: documentContentEtag(hugeBody),
  });

  await assert.rejects(
    () =>
      sqlClient.unsafe(
        "SELECT to_tsvector('simple', (SELECT string_agg('w' || i::text, ' ') FROM generate_series(1, 160000) i))",
      ),
    /too long for tsvector/i,
  );

  await upsertDocumentSearchIndex({
    documentId,
    workspaceId,
    searchBody: hugeBody,
    contentEtag: documentContentEtag(hugeBody),
  });

  const [indexRow] = await db
    .select()
    .from(documentSearchIndex)
    .where(eq(documentSearchIndex.documentId, documentId))
    .limit(1);
  assert.ok(indexRow);
  assert.ok((indexRow.searchBody?.length ?? 0) > 80_000);
  const hits = await searchDocuments({
    workspaceId,
    q: uniqueToken,
    limit: 10,
  });
  assert.ok(hits.some((row) => row.id === documentId));
});

test("OS-80 soft-delete restore keeps indexed body", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const documentId = id("doc-restore");
  const uniqueToken = `zxqrest${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const body = `# Restore\n${uniqueToken}\n`;

  context.after(async () => {
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "FTS restore",
    slug: id("fts-restore"),
    ownerUserId: userId,
  });
  await db.insert(documents).values({
    id: documentId,
    workspaceId,
    type: "knowledge",
    kind: "document",
    path: `fts/${documentId}.md`,
    title: "Restore me",
    storageKey: `fts/${documentId}.md`,
    contentType: "text/markdown; charset=utf-8",
    byteSize: Buffer.byteLength(body, "utf8"),
    checksum: checksumForContent(body),
    snippet: snippetForContent("Restore me"),
    contentVersion: 1,
    contentEtag: documentContentEtag(body),
  });
  await upsertDocumentSearchIndex({
    documentId,
    workspaceId,
    searchBody: body,
    contentEtag: documentContentEtag(body),
  });

  await db
    .update(documents)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(documents.id, documentId));
  await db
    .update(documents)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  const [indexRow] = await db
    .select()
    .from(documentSearchIndex)
    .where(eq(documentSearchIndex.documentId, documentId))
    .limit(1);
  assert.ok(indexRow?.searchBody?.includes(uniqueToken));
});

test("OS-80 backfill match, drift, and null etag cases", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const matchId = id("doc-match");
  const driftId = id("doc-drift");
  const nullId = id("doc-null");
  const yamlId = id("doc-yaml");
  const matchBody = "# Match\nvault bytes agree.\n";
  const driftVault = "# Drift vault\n";
  const driftRow = "# Drift row\n";
  const nullBody = "# Null etag\n";
  const yamlOriginal = "# Notes\nplain body\n";
  const yamlVault = "---\ntype: knowledge\n---\n\n# Notes\nplain body\n";

  context.after(async () => {
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "FTS backfill",
    slug: id("fts-backfill"),
    ownerUserId: userId,
  });

  const seed = async (input: {
    id: string;
    bodyForRow: string;
    contentEtag: string | null;
    checksum: string | null;
  }) => {
    await db.insert(documents).values({
      id: input.id,
      workspaceId,
      type: "knowledge",
      kind: "document",
      path: `fts/${input.id}.md`,
      title: input.id,
      storageKey: `fts/${input.id}.md`,
      contentType: "text/markdown; charset=utf-8",
      byteSize: Buffer.byteLength(input.bodyForRow, "utf8"),
      checksum: input.checksum,
      snippet: snippetForContent(input.bodyForRow),
      contentVersion: 1,
      contentEtag: input.contentEtag,
    });
  };

  await seed({
    id: matchId,
    bodyForRow: matchBody,
    contentEtag: documentContentEtag(matchBody),
    checksum: checksumForContent(matchBody),
  });
  await seed({
    id: driftId,
    bodyForRow: driftRow,
    contentEtag: documentContentEtag(driftRow),
    checksum: checksumForContent(driftRow),
  });
  await seed({
    id: nullId,
    bodyForRow: nullBody,
    contentEtag: null,
    checksum: null,
  });
  await seed({
    id: yamlId,
    bodyForRow: yamlVault,
    contentEtag: documentContentEtag(yamlOriginal),
    checksum: checksumForContent(yamlVault),
  });

  const vault: Record<string, string> = {
    [`fts/${matchId}.md`]: matchBody,
    [`fts/${driftId}.md`]: driftVault,
    [`fts/${nullId}.md`]: nullBody,
    [`fts/${yamlId}.md`]: yamlVault,
  };
  const expectedByKey: string[] = [];
  const getObject = async (
    storageKey: string,
    options?: { expectedEtag?: string | null },
  ) => {
    expectedByKey.push(`${storageKey}:${options?.expectedEtag ?? "none"}`);
    const body = vault[storageKey];
    if (!body) throw new Error("missing");
    return { body };
  };

  const first = await backfillDocumentSearchBodies({
    workspaceId,
    batchSize: 50,
    getObject,
  });
  assert.equal(first.updated, 4);
  assert.equal(first.etagDrift, 1);
  assert.equal(first.yamlRepaired, 1);
  assert.ok(expectedByKey.some((row) => row.endsWith(documentContentEtag(matchBody))));
  assert.ok(expectedByKey.some((row) => row.endsWith(":none")));

  const [matchIndex] = await db
    .select()
    .from(documentSearchIndex)
    .where(eq(documentSearchIndex.documentId, matchId));
  assert.equal(matchIndex?.contentEtag, documentContentEtag(matchBody));

  const [driftDoc] = await db.select().from(documents).where(eq(documents.id, driftId));
  const [driftIndex] = await db
    .select()
    .from(documentSearchIndex)
    .where(eq(documentSearchIndex.documentId, driftId));
  assert.equal(driftDoc?.contentEtag, documentContentEtag(driftRow));
  assert.equal(driftIndex?.contentEtag, documentContentEtag(driftVault));

  const [nullIndex] = await db
    .select()
    .from(documentSearchIndex)
    .where(eq(documentSearchIndex.documentId, nullId));
  assert.equal(nullIndex?.contentEtag, documentContentEtag(nullBody));

  const [yamlDoc] = await db.select().from(documents).where(eq(documents.id, yamlId));
  assert.equal(yamlDoc?.contentEtag, documentContentEtag(yamlVault));

  const loadsAfterFirst = expectedByKey.length;
  const second = await backfillDocumentSearchBodies({
    workspaceId,
    batchSize: 50,
    getObject,
  });
  assert.equal(second.scanned, 1);
  assert.equal(second.etagDrift, 1);
  assert.equal(expectedByKey.length, loadsAfterFirst + 1);
});

test("OS-80 retrieve still uses the indexed body after a property edit", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const uniqueToken = `zxqprop${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const previousVault = process.env.BACKSTEROS_VAULT_PATH;
  const savedR2: Partial<Record<(typeof R2_ENV_KEYS)[number], string | undefined>> =
    {};
  for (const key of R2_ENV_KEYS) {
    savedR2[key] = process.env[key];
    delete process.env[key];
  }
  const vaultRoot = await mkdtemp(path.join(tmpdir(), "bos-fts-prop-"));
  setVaultPathCache(vaultRoot);
  process.env.BACKSTEROS_VAULT_PATH = vaultRoot;

  context.after(async () => {
    setVaultPathCache(previousVault?.trim() || null);
    if (previousVault === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
    else process.env.BACKSTEROS_VAULT_PATH = previousVault;
    for (const key of R2_ENV_KEYS) {
      if (savedR2[key] === undefined) delete process.env[key];
      else process.env[key] = savedR2[key];
    }
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
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
    name: "FTS props",
    slug: id("fts-props"),
    ownerUserId: userId,
  });

  const row = await createDocument(workspaceId, {
    type: "knowledge",
    path: `fts/${id("prop")}.md`,
    title: "Property edit",
    content: `---
type: reference
status: draft
---

# Property edit
This paragraph contains ${uniqueToken} only in the body.
`,
  });
  assert.ok(row);

  const updated = await putDocumentProperties(workspaceId, row.id, {
    properties: { status: "current" },
    ifMatchVersion: row.contentVersion,
  });
  assert.ok(updated);

  const retrieved = await retrieveDocuments({
    workspaceId,
    q: uniqueToken,
    candidateLimit: 20,
  });
  assert.ok(retrieved.timing.indexedBodies >= 1);
  assert.ok(retrieved.results.some((hit) => hit.text.includes(uniqueToken)));
});

test("OS-80 createDocument oversized save leaves text past 80k unsearchable", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const uniqueEarly = `zxqearly${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const uniqueLate = `zxqlate${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const previousVault = process.env.BACKSTEROS_VAULT_PATH;
  const savedR2: Partial<Record<(typeof R2_ENV_KEYS)[number], string | undefined>> =
    {};
  for (const key of R2_ENV_KEYS) {
    savedR2[key] = process.env[key];
    delete process.env[key];
  }
  const vaultRoot = await mkdtemp(path.join(tmpdir(), "bos-fts-huge-save-"));
  setVaultPathCache(vaultRoot);
  process.env.BACKSTEROS_VAULT_PATH = vaultRoot;

  context.after(async () => {
    setVaultPathCache(previousVault?.trim() || null);
    if (previousVault === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
    else process.env.BACKSTEROS_VAULT_PATH = previousVault;
    for (const key of R2_ENV_KEYS) {
      if (savedR2[key] === undefined) delete process.env[key];
      else process.env[key] = savedR2[key];
    }
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
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
    name: "FTS huge save",
    slug: id("fts-huge-save"),
    ownerUserId: userId,
  });

  const padding = "lorem ".repeat(20_000);
  assert.ok(padding.length > 80_000);
  const row = await createDocument(workspaceId, {
    type: "knowledge",
    path: `fts/${id("huge")}.md`,
    title: "Oversized save",
    content: `${uniqueEarly}\n${padding}\n${uniqueLate}\n`,
  });
  assert.ok(row);

  const earlyHits = await searchDocuments({
    workspaceId,
    q: uniqueEarly,
    limit: 10,
  });
  const lateHits = await searchDocuments({
    workspaceId,
    q: uniqueLate,
    limit: 10,
  });
  assert.ok(earlyHits.some((hit) => hit.id === row.id));
  assert.equal(lateHits.some((hit) => hit.id === row.id), false);
});

test("OS-80 retrieve timings with mixed realistic markdown on backsteros_test", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const uniqueToken = `zxqmix${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const docCount = 400;
  const matchCount = 40;
  const vocab = [
    "Postgres GIN indexes rank markdown with simple lexemes and weighted titles.",
    "PowerSync ships metadata to clients while markdown bodies stay in the vault.",
    "Agents search knowledge notes then retrieve sections under a character budget.",
    "Replication copies table twins between local-core and cloud-core over HTTPS.",
    "Invoice drafts live beside house rules, runbooks, and meeting notes.",
    "Desktop Settings storage points BACKSTEROS_VAULT_PATH at the working copy.",
  ];

  const padMarkdown = (seed: number, targetBytes: number, extra = "") => {
    let body = `# Mixed ${seed}\n\n${extra}`;
    let i = 0;
    while (Buffer.byteLength(body, "utf8") < targetBytes) {
      body += `${vocab[i % vocab.length]} Sentence ${seed}-${i}.\n`;
      i += 1;
    }
    return body;
  };

  context.after(async () => {
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "FTS mixed",
    slug: id("fts-mixed"),
    ownerUserId: userId,
  });

  const rows = Array.from({ length: docCount }, (_, i) => {
    const docId = id(`mix-${i}`);
    let target = 2_000 + (i % 18) * 1_000;
    if (i >= docCount - 10) target = 110_000 + (i % 3) * 10_000;
    else if (i >= docCount - 50) target = 12_000 + (i % 8) * 1_000;
    const extra =
      i < matchCount ? `replicationledger ${uniqueToken}\n\n` : "";
    const body = padMarkdown(i, target, extra);
    return {
      id: docId,
      workspaceId,
      type: "knowledge" as const,
      kind: "document" as const,
      path: `fts/${docId}.md`,
      title: i < matchCount ? `Hit ${i}` : `Noise ${i}`,
      storageKey: `fts/${docId}.md`,
      contentType: "text/markdown; charset=utf-8",
      byteSize: Buffer.byteLength(body, "utf8"),
      checksum: checksumForContent(body),
      snippet: snippetForContent(body),
      contentVersion: 1,
      contentEtag: documentContentEtag(body),
      body,
    };
  });

  const sizes = rows.map((row) => row.byteSize).sort((a, b) => a - b);
  const pct = (p: number) => sizes[Math.min(sizes.length - 1, Math.floor((sizes.length - 1) * p))]!;

  for (let offset = 0; offset < rows.length; offset += 50) {
    const chunk = rows.slice(offset, offset + 50);
    await db.insert(documents).values(
      chunk.map(({ body: _body, ...row }) => row),
    );
    await Promise.all(
      chunk.map((row) =>
        upsertDocumentSearchIndex({
          documentId: row.id,
          workspaceId,
          searchBody: row.body,
          contentEtag: documentContentEtag(row.body),
        }),
      ),
    );
  }

  const runs: Array<{ cold: unknown; warm: unknown }> = [];
  for (let i = 0; i < 4; i += 1) {
    const cold = await retrieveDocuments({
      workspaceId,
      q: "replicationledger",
      candidateLimit: 100,
    });
    const warm = await retrieveDocuments({
      workspaceId,
      q: "replicationledger",
      candidateLimit: 100,
    });
    runs.push({ cold: cold.timing, warm: warm.timing });
    assert.ok(cold.results.length > 0);
    assert.ok(cold.results.length < docCount);
    assert.ok(cold.timing.indexedBodies > 0);
  }

  const hit = await retrieveDocuments({
    workspaceId,
    q: uniqueToken,
    candidateLimit: 100,
  });
  assert.ok(hit.results.some((row) => row.text.includes(uniqueToken)));
  console.log(
    JSON.stringify({
      os80ScaleMeasure: {
        documents: docCount,
        matchQuery: "replicationledger",
        matchDocs: matchCount,
        candidateLimit: 100,
        bodyBytes: {
          min: sizes[0],
          p50: pct(0.5),
          p90: pct(0.9),
          max: sizes[sizes.length - 1],
          mean: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
        },
        runs,
      },
    }),
  );
});
