import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldAutoFlushAfterSettle } from "./agent-chat-steer-first.ts";

test("failed steer never auto-flushes after settle", () => {
  assert.equal(
    shouldAutoFlushAfterSettle({
      interrupted: false,
      hasFailedSteer: true,
    }),
    false,
  );
});

test("natural settle still does not auto-flush (no queue)", () => {
  assert.equal(
    shouldAutoFlushAfterSettle({
      interrupted: false,
      hasFailedSteer: false,
    }),
    false,
  );
});

test("interrupted settle does not auto-flush", () => {
  assert.equal(
    shouldAutoFlushAfterSettle({
      interrupted: true,
      hasFailedSteer: true,
    }),
    false,
  );
});
