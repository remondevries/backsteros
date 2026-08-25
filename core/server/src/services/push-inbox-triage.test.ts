import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearInboxTriagePushDedupe,
  shouldSkipInboxTriagePush,
} from "./push-inbox-triage.js";

test("shouldSkipInboxTriagePush dedupes within TTL", () => {
  clearInboxTriagePushDedupe();
  const now = 1_000_000;
  assert.equal(shouldSkipInboxTriagePush("triage:email:a:b", now), false);
  assert.equal(shouldSkipInboxTriagePush("triage:email:a:b", now + 1), true);
  assert.equal(
    shouldSkipInboxTriagePush("triage:email:a:b", now + 60_001),
    false,
  );
});
