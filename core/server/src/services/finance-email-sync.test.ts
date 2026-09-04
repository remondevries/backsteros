import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { SYNC_ENTITIES, POWERSYNC_TABLES } from "../lib/sync-constants.js";
import { REPLICATED_TABLES } from "./core-replication/constants.js";

const REST_LEADER_ENTITIES = [
  "financial_transaction",
  "email_thread",
  "email_thread_comment",
] as const;

const REST_LEADER_TABLES = [
  "financial_transactions",
  "email_threads",
  "email_thread_comments",
] as const;

describe("finance + email REST-leader sync entities", () => {
  it("registers entities for ordered sync_events", () => {
    for (const entity of REST_LEADER_ENTITIES) {
      assert.ok((SYNC_ENTITIES as readonly string[]).includes(entity));
    }
  });

  it("keeps entities off PowerSync upload registry (REST leader-first only)", () => {
    for (const table of REST_LEADER_TABLES) {
      assert.ok(
        !(POWERSYNC_TABLES as readonly string[]).includes(table),
        `${table} must not be client-uploadable via PowerSync`,
      );
    }
  });

  it("twins tables via core replication", () => {
    for (const table of REST_LEADER_TABLES) {
      assert.ok((REPLICATED_TABLES as readonly string[]).includes(table));
    }
  });

  it("lists permanent validation errors as PowerSync-skippable", () => {
    const syncSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "sync.ts"),
      "utf8",
    );
    for (const code of [
      "INVALID_FINANCIAL_TRANSACTION",
      "INVALID_EMAIL_THREAD",
      "INVALID_EMAIL_THREAD_COMMENT",
    ]) {
      assert.ok(
        syncSrc.includes(`"${code}"`),
        `${code} must be in POWERSYNC_SKIPPABLE_ERRORS`,
      );
    }
  });

  it("routes call isRestLeaderFirstWrite for transactions and email comments", () => {
    const routes = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../app/routes.ts"),
      "utf8",
    );
    assert.ok(routes.includes('entity: "financial_transaction"'));
    assert.ok(routes.includes('entity: "email_thread"'));
    assert.ok(routes.includes('entity: "email_thread_comment"'));
    assert.ok(routes.includes("buildFinancialTransactionRestPayload"));
    assert.ok(routes.includes("buildEmailThreadRestPayload"));
    assert.ok(routes.includes("buildEmailThreadCommentRestPayload"));
    assert.ok(routes.includes("/api/v1/transactions/:id"));
    assert.ok(routes.includes("/api/v1/transactions/batch"));
    assert.ok(routes.includes("/api/v1/transactions/batch-delete"));
    assert.ok(
      routes.includes(
        "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments",
      ),
    );

    const txPatchIdx = routes.indexOf('app.patch(\n    "/api/v1/transactions/:id"');
    assert.ok(txPatchIdx >= 0);
    const txPatchSlice = routes.slice(txPatchIdx, txPatchIdx + 1200);
    assert.ok(txPatchSlice.includes("isRestLeaderFirstWrite()"));

    const commentPostIdx = routes.indexOf(
      'app.post(\n    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments"',
    );
    assert.ok(commentPostIdx >= 0);
    const commentSlice = routes.slice(commentPostIdx, commentPostIdx + 1500);
    assert.ok(commentSlice.includes("isRestLeaderFirstWrite()"));
  });

  it("registers missing email threads via leader-first batch, not list-path INSERT", () => {
    const emailThreadsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "email-threads.ts"),
      "utf8",
    );
    assert.ok(emailThreadsSrc.includes("commitRestEntityWriteBatch"));
    assert.ok(emailThreadsSrc.includes("commitNewEmailThreadLeaderFirst"));
    assert.ok(emailThreadsSrc.includes("preferredNumber"));
    assert.ok(emailThreadsSrc.includes("patchEmailThreadMetadataLeaderAware"));
    assert.ok(emailThreadsSrc.includes("deleteEmailThreadLeaderAware"));
  });
});
