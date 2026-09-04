import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MEETING_CONTENT_TAB_ORDER,
  resolveMeetingContentTabFromShortcutKey,
} from "./meeting-content-tab-shortcuts.js";

test("MEETING_CONTENT_TAB_ORDER is Summary / Notes / Transcription", () => {
  assert.deepEqual(MEETING_CONTENT_TAB_ORDER, [
    "summary",
    "notes",
    "transcription",
  ]);
});

test("resolveMeetingContentTabFromShortcutKey maps digit keys to content tabs", () => {
  assert.equal(resolveMeetingContentTabFromShortcutKey("1"), "summary");
  assert.equal(resolveMeetingContentTabFromShortcutKey("2"), "notes");
  assert.equal(resolveMeetingContentTabFromShortcutKey("3"), "transcription");
  assert.equal(resolveMeetingContentTabFromShortcutKey("4"), null);
  assert.equal(
    resolveMeetingContentTabFromShortcutKey("1", { metaKey: true }),
    null,
  );
});
