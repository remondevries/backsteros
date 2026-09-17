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

  it("uses hybrid scheduled-job leadership for recurring tasks", () => {
    const src = readSrc("recurring-tasks.ts");
    assert.ok(src.includes("shouldRunHybridScheduledJob"));
    assert.ok(src.includes("recordTaskRestSyncEvent"));
    assert.ok(src.includes("recordRecurringTaskRestSyncEvent"));
  });

  it("uses hybrid scheduled-job leadership for meeting portal reminders", () => {
    const src = readSrc("meeting-portal-emails.ts");
    assert.ok(src.includes("shouldRunHybridScheduledJob"));
    assert.ok(src.includes("sendMeetingPortalEmailToAttendee"));
    assert.ok(src.includes("recordMeetingRestSyncEvent"));
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

  it("nudges peer after cloud REST writes for CRM circle entities", () => {
    // Agent API-key path writes on cloud without commitRestEntityWrite —
    // without these helpers local-core waits on the ~15s replication tick.
    const routes = readSrc("../app/routes.ts");
    assert.ok(routes.includes("function publishTaskLive("));
    assert.ok(routes.includes("function publishMeetingLive("));
    assert.ok(routes.includes("function nudgeCrmActivityLive("));
    assert.ok(routes.includes("function nudgeContactLive("));
    assert.ok(routes.includes("function nudgeOrganizationLive("));
    assert.ok(routes.includes("function nudgeContactRelationshipLive("));
    assert.ok(routes.includes("function nudgeCrmGroupMemberLive("));
    assert.ok(routes.includes("function nudgeCrmRelationshipLabelLive("));
    assert.ok(routes.includes("nudgeContactLive(auth,"));
    assert.ok(routes.includes("nudgeOrganizationLive(auth,"));
    assert.ok(routes.includes("nudgeContactRelationshipLive(auth,"));
    assert.ok(routes.includes("nudgeCrmGroupMemberLive(auth,"));
    assert.ok(routes.includes("nudgeCrmRelationshipLabelLive(auth,"));
    assert.ok(routes.includes("publishTaskLive(auth,"));
    assert.ok(routes.includes("publishMeetingLive(auth,"));
    assert.ok(routes.includes("nudgeCrmActivityLive(auth,"));
    assert.ok(
      routes.includes('entity: "api_key"'),
      "API key create/update/revoke must wake peer (api_keys twin)",
    );

    // Writer-side push + peer pull so contact/org updates are bidirectional.
    const nudge = readSrc("core-replication/nudge.ts");
    assert.ok(nudge.includes("scheduleTableReplicationPush"));
    assert.ok(
      nudge.includes("replicatedTablesForEntity"),
      "nudge must map entity → tables for contacts/organizations push+pull",
    );

    // Central choke-point: every record*RestSyncEvent wakes the peer so new
    // cloud REST routes cannot silently skip replication again.
    const syncLog = readSrc("sync-log.ts");
    assert.ok(syncLog.includes("notifyPeerOfEntityWrite"));
    assert.ok(syncLog.includes('reason: "rest-sync-event"'));

    const spaces = readSrc("../app/spaces-routes.ts");
    assert.ok(spaces.includes("wakeSpacesDocuments"));
    const spacesPublish = readSrc("../app/spaces-publish-routes.ts");
    assert.ok(spacesPublish.includes("wakeSpacePublish"));
  });
});
