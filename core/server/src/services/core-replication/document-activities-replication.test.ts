import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REPLICATED_TABLES } from "./constants.js";
import { getTableSpec } from "./tables.js";

describe("document_activities replication cursor", () => {
  it("is replicated and watches updated_at for coalesce merges", () => {
    assert.ok(REPLICATED_TABLES.includes("document_activities"));
    const spec = getTableSpec("document_activities");
    assert.ok(spec);
    assert.equal(spec.updatedAtColumn, "updated_at");
    assert.equal(spec.optional, true);
  });
});
