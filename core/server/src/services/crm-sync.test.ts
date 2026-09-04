import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createCrmActivityNoteSchema } from "@backsteros/contracts";
import { POWERSYNC_PUBLICATION_TABLES } from "../db/powersync-tables.js";
import { meetingCrmActivityId } from "../lib/crypto.js";
import { SYNC_ENTITIES, POWERSYNC_TABLES, POWERSYNC_DOWNLOAD_ONLY_TABLES } from "../lib/sync-constants.js";
import { REPLICATED_TABLES } from "./core-replication/constants.js";

const CRM_ENTITIES = [
  "contact_relationship",
  "crm_relationship_label",
  "crm_group",
  "crm_group_member",
  "crm_activity",
] as const;

const CRM_TABLES = [
  "contact_relationships",
  "crm_relationship_labels",
  "crm_groups",
  "crm_group_members",
  "crm_activities",
] as const;

/** PowerSync publication tables that are download-only (server / REST writes). */
const downloadOnlyTables = new Set<string>(POWERSYNC_DOWNLOAD_ONLY_TABLES);

describe("CRM unified sync pipeline", () => {
  it("registers CRM entities for ordered sync_events", () => {
    for (const entity of CRM_ENTITIES) {
      assert.ok((SYNC_ENTITIES as readonly string[]).includes(entity));
    }
  });

  it("registers CRM tables for PowerSync upload mapping", () => {
    for (const table of CRM_TABLES) {
      assert.ok((POWERSYNC_TABLES as readonly string[]).includes(table));
    }
  });

  it("includes CRM in core replication table twin", () => {
    for (const table of CRM_TABLES) {
      assert.ok((REPLICATED_TABLES as readonly string[]).includes(table));
    }
  });

  it("publishes CRM tables to client PowerSync", () => {
    for (const table of CRM_TABLES) {
      assert.ok((POWERSYNC_PUBLICATION_TABLES as readonly string[]).includes(table));
    }
  });

  it("documents download-only publication tables outside upload registry", () => {
    for (const table of POWERSYNC_PUBLICATION_TABLES) {
      if (downloadOnlyTables.has(table)) {
        assert.ok(
          !(POWERSYNC_TABLES as readonly string[]).includes(table),
          `${table} must stay download-only`,
        );
        continue;
      }
      assert.ok(
        (POWERSYNC_TABLES as readonly string[]).includes(table),
        `${table} is published but missing from POWERSYNC_TABLES upload registry`,
      );
    }
  });

  it("parses CRM note creates with kind note", () => {
    const parsed = createCrmActivityNoteSchema.safeParse({
      kind: "note",
      body: "Hello",
    });
    assert.equal(parsed.success, true);
    const missingKind = createCrmActivityNoteSchema.safeParse({
      body: "Hello",
    });
    assert.equal(missingKind.success, false);
  });

  it("uses stable ids for meeting-derived CRM activities", () => {
    const a = meetingCrmActivityId("m1", "contact", "c1");
    const b = meetingCrmActivityId("m1", "contact", "c1");
    const c = meetingCrmActivityId("m1", "contact", "c2");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(a.length, 21);
  });

  it("publishes PowerSync tombstones (no deleted_at IS NULL filter)", () => {
    const yaml = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../deploy/powersync/sync-config.yaml",
      ),
      "utf8",
    );
    assert.equal(
      yaml.includes("deleted_at IS NULL"),
      false,
      "sync rules must include soft-deleted rows so clients receive tombstones",
    );
  });

  it("lists permanent CRM validation errors as PowerSync-skippable", () => {
    const syncSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "sync.ts"),
      "utf8",
    );
    for (const code of [
      "INVALID_CRM_ACTIVITY",
      "INVALID_CRM_GROUP",
      "INVALID_CRM_GROUP_MEMBER",
      "INVALID_CONTACT_RELATIONSHIP",
      "INVALID_TASK_COMMENT",
    ]) {
      assert.ok(
        syncSrc.includes(`"${code}"`),
        `${code} must be in POWERSYNC_SKIPPABLE_ERRORS`,
      );
    }
  });

  it("keeps download-only tables off the upload registry (table twin only)", () => {
    for (const table of POWERSYNC_DOWNLOAD_ONLY_TABLES) {
      assert.ok((POWERSYNC_PUBLICATION_TABLES as readonly string[]).includes(table));
      assert.ok(!(POWERSYNC_TABLES as readonly string[]).includes(table));
      assert.ok(
        (REPLICATED_TABLES as readonly string[]).includes(table),
        `${table} must twin via core replication without sync_events upload`,
      );
    }
  });

  it("seeds default relationship labels leader-first instead of local INSERT on list", () => {
    const labelsSrc = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "crm-relationship-labels.ts",
      ),
      "utf8",
    );
    assert.ok(labelsSrc.includes("commitRestEntityWriteBatch"));
    assert.ok(labelsSrc.includes("recordCrmRelationshipLabelRestSyncEvent"));
    assert.ok(labelsSrc.includes("shouldForwardMutationsToLeader"));
  });
});
