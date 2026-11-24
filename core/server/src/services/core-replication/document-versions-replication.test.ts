import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REPLICATED_TABLES } from "./constants.js";
import { getTableSpec } from "./tables.js";
import { replicatedTablesForEntity } from "./entity-tables.js";

describe("document_versions replication cursor", () => {
  it("is replicated and watches updated_at for upsert coalescing", () => {
    assert.ok(REPLICATED_TABLES.includes("document_versions"));
    const spec = getTableSpec("document_versions");
    assert.ok(spec);
    assert.equal(spec.updatedAtColumn, "updated_at");
    assert.equal(spec.optional, true);
  });

  it("is nudged with document writes", () => {
    const tables = replicatedTablesForEntity("document");
    assert.ok(tables.includes("document_versions"));
    assert.deepEqual(replicatedTablesForEntity("document_version"), [
      "document_versions",
    ]);
  });
});
