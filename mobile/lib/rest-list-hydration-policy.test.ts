import assert from "node:assert/strict";
import { test } from "node:test";

import {
  shouldMobileRestHydrateColdStart,
  shouldMobileRestHydrateOnForeground,
  shouldMobileRestHydrateOnSyncEpoch,
} from "./rest-list-hydration-policy.ts";

test("mobile REST hydration skips sync epoch when PowerSync connected", () => {
  assert.equal(shouldMobileRestHydrateOnSyncEpoch(true), false);
  assert.equal(shouldMobileRestHydrateOnSyncEpoch(false), true);
});

test("mobile REST hydration skips foreground refetch when connected", () => {
  assert.equal(shouldMobileRestHydrateOnForeground(true), false);
  assert.equal(shouldMobileRestHydrateOnForeground(false), true);
});

test("mobile REST cold-start only when offline or SQLite empty", () => {
  assert.equal(shouldMobileRestHydrateColdStart(true, true), false);
  assert.equal(shouldMobileRestHydrateColdStart(true, false), true);
  assert.equal(shouldMobileRestHydrateColdStart(false, true), true);
  assert.equal(shouldMobileRestHydrateColdStart(false, false), true);
});
