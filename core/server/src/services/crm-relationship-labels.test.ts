import assert from "node:assert/strict";
import test from "node:test";

import {
  relationshipTypeLabel,
  relationshipTypeLabelFromCatalog,
  RELATIONSHIP_TYPE_LABELS,
  slugifyRelationshipLabel,
} from "./crm-relationship-label-utils.js";
import type { CrmRelationshipLabel } from "@backsteros/contracts";

const parentChild: CrmRelationshipLabel = {
  id: "1",
  workspaceId: "w",
  sideALabel: "Parent",
  sideASlug: "parent",
  sideBLabel: "Child",
  sideBSlug: "child",
  color: null,
  sortOrder: 10,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
};

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

test("catalog resolves bidirectional sides", () => {
  assert.equal(
    relationshipTypeLabelFromCatalog("parent", "outgoing", [parentChild]),
    "Parent",
  );
  assert.equal(
    relationshipTypeLabelFromCatalog("parent", "incoming", [parentChild]),
    "Child",
  );
  assert.equal(
    relationshipTypeLabelFromCatalog("child", "outgoing", [parentChild]),
    "Child",
  );
  assert.equal(
    relationshipTypeLabelFromCatalog("child", "incoming", [parentChild]),
    "Parent",
  );
});

test("relationshipTypeLabel prefers catalog over presets", () => {
  const custom: CrmRelationshipLabel = {
    ...parentChild,
    sideALabel: "Mama",
    sideBLabel: "Kid",
  };
  assert.equal(relationshipTypeLabel("parent", "outgoing", [custom]), "Mama");
  assert.equal(relationshipTypeLabel("parent", "incoming", [custom]), "Kid");
});

test("custom relationship slugs use title-case labels", () => {
  assert.equal(relationshipTypeLabel("son", "outgoing"), "Son");
  assert.equal(relationshipTypeLabel("best_friend", "incoming"), "Best Friend");
});

test("slugifyRelationshipLabel", () => {
  assert.equal(slugifyRelationshipLabel("Best Friend"), "best_friend");
  assert.equal(slugifyRelationshipLabel("  Son! "), "son");
});

test("every fallback relationship type has outgoing and incoming labels", () => {
  for (const [type, labels] of Object.entries(RELATIONSHIP_TYPE_LABELS)) {
    assert.ok(labels.outgoing.length > 0, `${type} outgoing`);
    assert.ok(labels.incoming.length > 0, `${type} incoming`);
  }
});
