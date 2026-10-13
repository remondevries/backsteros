import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMeetingContentTabOrder,
  MEETING_DETAILS_TAB,
  resolveMeetingContentTabFromShortcutKey,
} from "./meeting-content-tab-shortcuts.js";

test("buildMeetingContentTabOrder includes transcription + details for video calls", () => {
  assert.deepEqual(buildMeetingContentTabOrder({ isVideoCall: true }), [
    "summary",
    "notes",
    "transcription",
    "details",
  ]);
});

test("buildMeetingContentTabOrder omits transcription + details for other formats", () => {
  assert.deepEqual(buildMeetingContentTabOrder({ isVideoCall: false }), [
    "summary",
    "notes",
  ]);
});

test("resolveMeetingContentTabFromShortcutKey maps digit keys to visible tabs", () => {
  const videoTabs = buildMeetingContentTabOrder({ isVideoCall: true });
  assert.equal(resolveMeetingContentTabFromShortcutKey("1", {}, videoTabs), "summary");
  assert.equal(resolveMeetingContentTabFromShortcutKey("2", {}, videoTabs), "notes");
  assert.equal(
    resolveMeetingContentTabFromShortcutKey("3", {}, videoTabs),
    "transcription",
  );
  assert.equal(
    resolveMeetingContentTabFromShortcutKey("4", {}, videoTabs),
    MEETING_DETAILS_TAB,
  );
  assert.equal(resolveMeetingContentTabFromShortcutKey("5", {}, videoTabs), null);

  const phoneTabs = buildMeetingContentTabOrder({ isVideoCall: false });
  assert.equal(resolveMeetingContentTabFromShortcutKey("1", {}, phoneTabs), "summary");
  assert.equal(resolveMeetingContentTabFromShortcutKey("2", {}, phoneTabs), "notes");
  assert.equal(resolveMeetingContentTabFromShortcutKey("3", {}, phoneTabs), null);

  assert.equal(
    resolveMeetingContentTabFromShortcutKey("1", { metaKey: true }, videoTabs),
    null,
  );
});
