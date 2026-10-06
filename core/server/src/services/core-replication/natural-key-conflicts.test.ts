import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NATURAL_KEY_TABLES,
  REPLICATED_UNIQUE_FORKS,
  naturalKeyColumnsFor,
  naturalKeyForkWinner,
} from "./natural-key-conflicts.js";
import { HEALABLE_SOFT_UNIQUE_CONSTRAINTS } from "./soft-unique-conflicts.js";

describe("natural-key fork resolution (OS-40 / OS-89)", () => {
  const older = new Date("2026-09-13T17:41:20.092Z");
  const newer = new Date("2026-09-13T18:21:18.316Z");

  it("registers identity tables whose ids are not referenced", () => {
    assert.deepEqual(naturalKeyColumnsFor("space_publish_settings"), [
      "workspace_id",
      "space_document_id",
    ]);
    assert.deepEqual(naturalKeyColumnsFor("space_site_keys"), [
      "workspace_id",
      "space_document_id",
      "site_key_prefix",
    ]);
    assert.deepEqual(naturalKeyColumnsFor("avatars"), [
      "workspace_id",
      "entity_type",
      "entity_id",
    ]);
    assert.deepEqual(naturalKeyColumnsFor("device_push_tokens"), [
      "workspace_id",
      "token",
    ]);
    assert.deepEqual(naturalKeyColumnsFor("financial_transactions"), [
      "bank_account_id",
      "fingerprint",
    ]);
    assert.equal(naturalKeyColumnsFor("tasks"), null);
    assert.equal(naturalKeyColumnsFor("contacts"), null);
  });

  it("keeps NATURAL_KEY_TABLES aligned with the fork inventory", () => {
    const healTables = new Set(
      REPLICATED_UNIQUE_FORKS.filter((row) => row.policy === "heal_natural_key").map(
        (row) => row.table,
      ),
    );
    assert.deepEqual(
      [...healTables].sort(),
      [...Object.keys(NATURAL_KEY_TABLES)].sort(),
    );
    for (const row of REPLICATED_UNIQUE_FORKS) {
      if (row.policy === "heal_natural_key") {
        assert.deepEqual(naturalKeyColumnsFor(row.table), row.columns);
      }
    }
  });

  it("soft-unique inventory matches HEALABLE_SOFT_UNIQUE_CONSTRAINTS", () => {
    const fromInventory = new Set(
      REPLICATED_UNIQUE_FORKS.filter((row) => row.policy === "heal_soft_unique").map(
        (row) => row.constraint,
      ),
    );
    assert.deepEqual(
      [...fromInventory].sort(),
      [...HEALABLE_SOFT_UNIQUE_CONSTRAINTS].sort(),
    );
  });

  it("records contacts.email as not unique (OS-72 finding is stale)", () => {
    const email = REPLICATED_UNIQUE_FORKS.find(
      (row) => row.constraint === "contacts_email_idx",
    );
    assert.equal(email?.policy, "not_unique");
  });

  it("newest updated_at wins", () => {
    assert.equal(
      naturalKeyForkWinner(
        { id: "PWt24_zXh8RAG-Nt6SHRr", updatedAt: newer },
        { id: "-dvvMp0mJVHCR8CI9guGM", updatedAt: older },
      ),
      "incoming",
    );
    assert.equal(
      naturalKeyForkWinner(
        { id: "-dvvMp0mJVHCR8CI9guGM", updatedAt: older },
        { id: "PWt24_zXh8RAG-Nt6SHRr", updatedAt: newer },
      ),
      "existing",
    );
  });

  it("is symmetric on both peers, including ties", () => {
    for (const [a, b] of [
      [older, newer],
      [newer, older],
      [older, older],
    ] as const) {
      const x = { id: "AUy2UwhJSMT3K-RZab9Uj", updatedAt: a };
      const y = { id: "q4qdjK1S5WV7q7rCUwLt5", updatedAt: b };
      const onPeer1 = naturalKeyForkWinner(x, y) === "incoming" ? x.id : y.id;
      const onPeer2 = naturalKeyForkWinner(y, x) === "incoming" ? y.id : x.id;
      assert.equal(onPeer1, onPeer2);
    }
  });

  it("tie keeps the larger id", () => {
    assert.equal(
      naturalKeyForkWinner(
        { id: "b", updatedAt: older },
        { id: "a", updatedAt: older },
      ),
      "incoming",
    );
  });

  it("an unparseable timestamp loses to a valid one", () => {
    assert.equal(
      naturalKeyForkWinner(
        { id: "a", updatedAt: new Date("nope") },
        { id: "b", updatedAt: older },
      ),
      "existing",
    );
  });
});
