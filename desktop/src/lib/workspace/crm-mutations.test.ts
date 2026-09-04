import assert from "node:assert/strict";
import test from "node:test";

import { CRM_ACTIVITY_PREVIEW_MAX_CHARS } from "@backsteros/contracts";

import { shouldSkipRestEntityWrite } from "./powersync-write-path";

test("shouldSkipRestEntityWrite when PowerSync connected", () => {
  assert.equal(
    shouldSkipRestEntityWrite({ ready: true, connected: true }),
    true,
  );
  assert.equal(
    shouldSkipRestEntityWrite({ ready: true, connected: false }),
    false,
  );
});

test("activity preview length matches contract cap", () => {
  const long = "x".repeat(CRM_ACTIVITY_PREVIEW_MAX_CHARS + 20);
  const trimmed = long.trim();
  const preview =
    trimmed.length <= CRM_ACTIVITY_PREVIEW_MAX_CHARS
      ? trimmed
      : `${trimmed.slice(0, CRM_ACTIVITY_PREVIEW_MAX_CHARS - 1)}…`;
  assert.equal(preview.length, CRM_ACTIVITY_PREVIEW_MAX_CHARS);
  assert.ok(preview.endsWith("…"));
});
