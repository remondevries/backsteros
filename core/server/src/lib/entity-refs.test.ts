import assert from "node:assert/strict";
import test from "node:test";

import { parseContactDisplayNumber } from "./entity-refs.js";
import {
  parseTaskDisplayKey,
  TASK_DISPLAY_KEY_RE,
} from "./task-filters.js";

test("parseContactDisplayNumber accepts C-<number>", () => {
  assert.equal(parseContactDisplayNumber("C-27"), 27);
  assert.equal(parseContactDisplayNumber("c-1"), 1);
  assert.equal(parseContactDisplayNumber("  C-251  "), 251);
  assert.equal(parseContactDisplayNumber("C-0"), null);
  assert.equal(parseContactDisplayNumber("C-"), null);
  assert.equal(parseContactDisplayNumber("remon"), null);
  assert.equal(parseContactDisplayNumber("O-12"), null);
});

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
