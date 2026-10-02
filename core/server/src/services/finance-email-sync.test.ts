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
    const appDir = join(dirname(fileURLToPath(import.meta.url)), "../app");
    const financeRoutes = readFileSync(join(appDir, "finance-routes.ts"), "utf8");
    const emailRoutes = readFileSync(join(appDir, "email-routes.ts"), "utf8");
    assert.ok(financeRoutes.includes('entity: "financial_transaction"'));
    assert.ok(emailRoutes.includes('entity: "email_thread"'));
    assert.ok(emailRoutes.includes('entity: "email_thread_comment"'));
    assert.ok(financeRoutes.includes("buildFinancialTransactionRestPayload"));
    assert.ok(emailRoutes.includes("buildEmailThreadRestPayload"));
    assert.ok(emailRoutes.includes("buildEmailThreadCommentRestPayload"));
    assert.ok(financeRoutes.includes("/api/v1/transactions/:id"));
    assert.ok(financeRoutes.includes("/api/v1/transactions/batch"));
    assert.ok(financeRoutes.includes("/api/v1/transactions/batch-delete"));
    assert.ok(
      emailRoutes.includes(
        "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments",
      ),
    );

    const txPatchIdx = financeRoutes.indexOf('app.patch(\n    "/api/v1/transactions/:id"');
    assert.ok(txPatchIdx >= 0);
    const txPatchSlice = financeRoutes.slice(txPatchIdx, txPatchIdx + 1200);
    assert.ok(txPatchSlice.includes("isRestLeaderFirstWrite()"));

    const commentPostIdx = emailRoutes.indexOf(
      'app.post(\n    "/api/v1/email/inboxes/:inboxId/threads/:threadKey/comments"',
    );
    assert.ok(commentPostIdx >= 0);
    const commentSlice = emailRoutes.slice(commentPostIdx, commentPostIdx + 1500);
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
