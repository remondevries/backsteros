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

test("shouldDesktopSkipRestHydrateAfterSync when ready with lastSyncedAt", () => {
  assert.equal(
    shouldDesktopSkipRestHydrateAfterSync(true, new Date()),
    true,
  );
  assert.equal(shouldDesktopSkipRestHydrateAfterSync(true, null), false);
  assert.equal(
    shouldDesktopSkipRestHydrateAfterSync(false, new Date()),
    false,
  );
});
