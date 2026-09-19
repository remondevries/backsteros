import assert from "node:assert/strict";
import { test } from "node:test";

import {
  shouldDesktopRestHydrateColdStart,
  shouldDesktopSkipRestHydrateAfterSync,
} from "./rest-list-hydration-policy.ts";

test("shouldDesktopRestHydrateColdStart matches mobile empty/offline gate", () => {
  assert.equal(shouldDesktopRestHydrateColdStart(true, true), false);
  assert.equal(shouldDesktopRestHydrateColdStart(true, false), true);
  assert.equal(shouldDesktopRestHydrateColdStart(false, true), true);
  assert.equal(shouldDesktopRestHydrateColdStart(false, false), true);
});

test("shouldDesktopSkipRestHydrateAfterSync only when ready, synced, and local rows exist", () => {
  assert.equal(
    shouldDesktopSkipRestHydrateAfterSync(true, new Date(), true),
    true,
  );
  assert.equal(
    shouldDesktopSkipRestHydrateAfterSync(true, new Date(), false),
    false,
  );
  assert.equal(shouldDesktopSkipRestHydrateAfterSync(true, null, true), false);
  assert.equal(
    shouldDesktopSkipRestHydrateAfterSync(false, new Date(), true),
    false,
  );
});
