import assert from "node:assert/strict";
import test from "node:test";

import {
  relationshipTypeLabel,
  RELATIONSHIP_TYPE_LABELS,
} from "./crm-relationship-labels.js";

test("relationship inverse labels are symmetric for family edges", () => {
  assert.equal(relationshipTypeLabel("child", "outgoing"), "Child");
  assert.equal(relationshipTypeLabel("child", "incoming"), "Parent");
  assert.equal(relationshipTypeLabel("parent", "outgoing"), "Parent");
  assert.equal(relationshipTypeLabel("parent", "incoming"), "Child");
  assert.equal(relationshipTypeLabel("spouse", "outgoing"), "Spouse");
  assert.equal(relationshipTypeLabel("spouse", "incoming"), "Spouse");
  assert.equal(
    relationshipTypeLabel("reports_to", "outgoing"),
    "Reports to",
  );
  assert.equal(
    relationshipTypeLabel("reports_to", "incoming"),
    "Manager of",
  );
});

test("every relationship type has outgoing and incoming labels", () => {
  for (const [type, labels] of Object.entries(RELATIONSHIP_TYPE_LABELS)) {
    assert.ok(labels.outgoing.length > 0, `${type} outgoing`);
    assert.ok(labels.incoming.length > 0, `${type} incoming`);
  }
});
