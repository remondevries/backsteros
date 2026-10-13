import assert from "node:assert/strict";
import { test } from "node:test";

import { needsMentionCatalog } from "./needs-mention-catalog";

test("needsMentionCatalog is true for calendar overlay routes", () => {
  assert.equal(needsMentionCatalog("/calendar", false), true);
  assert.equal(needsMentionCatalog("/calendar/meetings/m-1", false), true);
  assert.equal(needsMentionCatalog("/calendar/tasks/t-1", false), true);
});

test("needsMentionCatalog is true for project and finance editors", () => {
  assert.equal(needsMentionCatalog("/projects/bsh", false), true);
  assert.equal(needsMentionCatalog("/finance/transactions", false), true);
});

test("needsMentionCatalog is true for contact-scoped meeting detail", () => {
  assert.equal(needsMentionCatalog("/contacts/12/meetings/m-1", false), true);
  assert.equal(
    needsMentionCatalog("/organizations/acme/contacts/12/meetings/m-1", false),
    true,
  );
});

test("needsMentionCatalog is false for settings", () => {
  assert.equal(needsMentionCatalog("/settings", false), false);
});
