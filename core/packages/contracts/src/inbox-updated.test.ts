import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inboxUpdatedAtRequiresInboxListing,
  shouldClearInboxUpdatedOnUserWrite,
  taskPatchRequiresRestWrite,
} from "./inbox-updated.js";

test("shouldClearInboxUpdatedOnUserWrite clears only on explicit acknowledgement", () => {
  assert.equal(
    shouldClearInboxUpdatedOnUserWrite({ acknowledgeInboxUpdate: true }),
    true,
  );
  assert.equal(shouldClearInboxUpdatedOnUserWrite({}), false);
  assert.equal(
    shouldClearInboxUpdatedOnUserWrite({ acknowledgeInboxUpdate: false }),
    false,
  );
});

test("inboxUpdatedAtRequiresInboxListing includes any valid updated timestamp", () => {
  assert.equal(
    inboxUpdatedAtRequiresInboxListing("2026-08-24T14:27:22.672Z"),
    true,
  );
  assert.equal(inboxUpdatedAtRequiresInboxListing(null), false);
  assert.equal(inboxUpdatedAtRequiresInboxListing(""), false);
});

test("taskPatchRequiresRestWrite for agent inbox sign-off only", () => {
  assert.equal(taskPatchRequiresRestWrite({ agentInboxApproved: true }), true);
  assert.equal(taskPatchRequiresRestWrite({ agentInboxApproved: false }), false);
  assert.equal(taskPatchRequiresRestWrite({ title: "x" }), false);
});
