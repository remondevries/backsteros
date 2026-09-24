import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRelativeAgeLabel } from "./format-relative-age.js";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

test("formatRelativeAgeLabel covers minute to year buckets", () => {
  assert.equal(formatRelativeAgeLabel(NOW - 30_000, NOW), "just now");
  assert.equal(formatRelativeAgeLabel(NOW - 60_000, NOW), "1 minute ago");
  assert.equal(formatRelativeAgeLabel(NOW - 5 * 60_000, NOW), "5 minutes ago");
  assert.equal(formatRelativeAgeLabel(NOW - 60 * 60_000, NOW), "1 hour ago");
  assert.equal(formatRelativeAgeLabel(NOW - 5 * 60 * 60_000, NOW), "5 hours ago");
  assert.equal(formatRelativeAgeLabel(NOW - 24 * 60 * 60_000, NOW), "1 day ago");
  assert.equal(formatRelativeAgeLabel(NOW - 3 * 24 * 60 * 60_000, NOW), "3 days ago");
  assert.equal(formatRelativeAgeLabel(NOW - 7 * 24 * 60 * 60_000, NOW), "1 week ago");
  assert.equal(formatRelativeAgeLabel(NOW - 14 * 24 * 60 * 60_000, NOW), "2 weeks ago");
  assert.equal(formatRelativeAgeLabel(NOW - 45 * 24 * 60 * 60_000, NOW), "1 month ago");
  assert.equal(formatRelativeAgeLabel(NOW - 400 * 24 * 60 * 60_000, NOW), "1 year ago");
});

test("formatRelativeAgeLabel returns empty for missing values", () => {
  assert.equal(formatRelativeAgeLabel(null, NOW), "");
  assert.equal(formatRelativeAgeLabel(undefined, NOW), "");
  assert.equal(formatRelativeAgeLabel("not-a-date", NOW), "");
});
