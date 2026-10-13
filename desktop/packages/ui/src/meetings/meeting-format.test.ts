import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getMeetingFormatLabel,
  isMeetingFormat,
  normalizeMeetingFormat,
} from "./meeting-format.js";

test("normalizeMeetingFormat falls back to video_call", () => {
  assert.equal(normalizeMeetingFormat(undefined), "video_call");
  assert.equal(normalizeMeetingFormat("invalid"), "video_call");
  assert.equal(normalizeMeetingFormat("in_person"), "in_person");
});

test("isMeetingFormat accepts booking portal values", () => {
  assert.equal(isMeetingFormat("phone_call"), true);
  assert.equal(isMeetingFormat("video_call"), true);
  assert.equal(isMeetingFormat("in_person"), true);
});

test("getMeetingFormatLabel returns display labels", () => {
  assert.equal(getMeetingFormatLabel("in_person"), "In person");
  assert.equal(getMeetingFormatLabel("video_call"), "Video call");
  assert.equal(getMeetingFormatLabel("phone_call"), "Phone call");
});
