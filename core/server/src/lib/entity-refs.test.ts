import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTaskDisplayKey,
  TASK_DISPLAY_KEY_RE,
} from "./task-filters.js";

test("parseTaskDisplayKey accepts KEY-number (case-insensitive)", () => {
  assert.deepEqual(parseTaskDisplayKey("OS-45"), {
    projectKey: "OS",
    number: 45,
  });
  assert.deepEqual(parseTaskDisplayKey("qm-38"), {
    projectKey: "QM",
    number: 38,
  });
  assert.deepEqual(parseTaskDisplayKey("INBOX-3"), {
    projectKey: "INBOX",
    number: 3,
  });
  assert.deepEqual(parseTaskDisplayKey("  ABC123-9  "), {
    projectKey: "ABC123",
    number: 9,
  });
});

test("parseTaskDisplayKey rejects non-keys", () => {
  assert.equal(parseTaskDisplayKey(""), null);
  assert.equal(parseTaskDisplayKey("OS"), null);
  assert.equal(parseTaskDisplayKey("UzK-zUQsQpwO4F55UVM8p"), null);
  assert.equal(parseTaskDisplayKey("45-OS"), null);
  assert.equal(parseTaskDisplayKey("OS-"), null);
  assert.equal(parseTaskDisplayKey("-45"), null);
});

test("TASK_DISPLAY_KEY_RE matches the accepted pattern", () => {
  assert.ok(TASK_DISPLAY_KEY_RE.test("OS-1"));
  assert.ok(!TASK_DISPLAY_KEY_RE.test("1-OS"));
});
