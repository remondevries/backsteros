import assert from "node:assert/strict";
import { test } from "node:test";

import { turnFoldLabel } from "./agent-chat-timeline.ts";

test("interrupted fold label with duration", () => {
  assert.equal(
    turnFoldLabel({
      outcome: "interrupted",
      startedAt: 1_000,
      endedAt: 48_000,
      activityCount: 2,
    }),
    "You stopped after 47s",
  );
});

test("interrupted fold label without duration", () => {
  assert.equal(
    turnFoldLabel({
      outcome: "interrupted",
      startedAt: null,
      endedAt: null,
      activityCount: 0,
    }),
    "You stopped this response",
  );
});

test("completed outcome keeps Worked labels", () => {
  assert.equal(
    turnFoldLabel({
      outcome: "completed",
      startedAt: 1_000,
      endedAt: 13_000,
      activityCount: 4,
    }),
    "Worked for 12s",
  );
});
