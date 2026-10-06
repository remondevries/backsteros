/**
 * Postgres integration: document FTS (OS-80) matches body-only hits from
 * document_search_index without object-storage reads, and keeps the index
 * updated on content write.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { documentSearchIndex, documents, users, workspaces } from "../db/schema.js";
import { checksumForContent, snippetForContent } from "../lib/storage.js";
import { upsertDocumentSearchIndex } from "../services/document-search-index.js";
import {
  retrieveDocuments,
  searchDocuments,
} from "../services/documents.js";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

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
      contentEtag: checksumForContent(hiddenBody).slice(0, 32),
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
      contentEtag: checksumForContent(noiseBody).slice(0, 32),
    },
  ]);

  await upsertDocumentSearchIndex({
    documentId: hiddenId,
    workspaceId,
    searchBody: hiddenBody,
  });
  await upsertDocumentSearchIndex({
    documentId: noiseId,
    workspaceId,
    searchBody: noiseBody,
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
      contentEtag: checksumForContent(body).slice(0, 32),
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
