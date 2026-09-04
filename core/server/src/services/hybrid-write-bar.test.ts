import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { SYNC_ENTITIES } from "../lib/sync-constants.js";
import { REPLICATED_TABLES } from "./core-replication/constants.js";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(relative: string): string {
  return readFileSync(join(here, relative), "utf8");
}

/**
 * Hybrid write bar — regressions here mean invent-on-list / dual-core spawners
 * crept back. Intentional twin-only surfaces are listed in
 * docs/13-hybrid-cloud-local-core.md (do not add them here as "must be leader-first").
 */
describe("hybrid write bar", () => {
  it("keeps leader-clock entities in SYNC_ENTITIES", () => {
    for (const entity of [
      "email_thread",
      "email_thread_comment",
      "recurring_task",
      "mention",
      "crm_relationship_label",
      "financial_transaction",
      "task_activity",
    ] as const) {
      assert.ok(
        (SYNC_ENTITIES as readonly string[]).includes(entity),
        `${entity} must stay on the ordered sync_events clock`,
      );
    }
  });

  it("does not spawn recurring tasks on local-core", () => {
    const src = readSrc("recurring-tasks.ts");
    assert.ok(src.includes("shouldRunRecurringTaskSpawner"));
    assert.ok(
      src.includes(
        'process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() !== "local"',
      ),
    );
    assert.ok(src.includes("recordTaskRestSyncEvent"));
    assert.ok(src.includes("recordRecurringTaskRestSyncEvent"));
  });

  it("registers and deletes email threads leader-first (not invent-on-list / hard-delete twin-only)", () => {
    const email = readSrc("email-threads.ts");
    assert.ok(email.includes("commitRestEntityWriteBatch"));
    assert.ok(email.includes("commitNewEmailThreadLeaderFirst"));
    assert.ok(email.includes("deleteEmailThreadLeaderAware"));
    assert.ok(email.includes("preferredNumber"));
    assert.ok(email.includes("patchEmailThreadMetadataLeaderAware"));

    const agentmail = readSrc("agentmail-settings.ts");
    assert.ok(agentmail.includes("deleteEmailThreadLeaderAware"));
    assert.equal(
      agentmail.includes("deleteEmailThreadLocal("),
      false,
      "AgentMail delete paths must not hard-delete without sync_events",
    );
  });

  it("seeds CRM relationship labels leader-first", () => {
    const src = readSrc("crm-relationship-labels.ts");
    assert.ok(src.includes("commitRestEntityWriteBatch"));
    assert.ok(src.includes("shouldForwardMutationsToLeader"));
  });

  it("creates financial_transactions via sync apply (CSV / Moneybird leader-first)", () => {
    const sync = readSrc("sync.ts");
    assert.ok(sync.includes("insertTransactionFromSync"));
    const finance = readSrc("finance/finance.ts");
    assert.ok(finance.includes("commitFinancialTransactionCreates"));
    assert.ok(finance.includes("financialTransactionCreateSyncPayload"));
    const moneybird = readSrc("finance/moneybird-sync.ts");
    assert.ok(moneybird.includes("commitFinancialTransactionCreates"));
    assert.ok(
      (REPLICATED_TABLES as readonly string[]).includes(
        "financial_transactions",
      ),
    );
  });
});
