import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePendingPageSurface } from "./pending-navigation-routes.ts";

test("resolvePendingPageSurface maps canonical section roots", () => {
  assert.equal(resolvePendingPageSurface("/tasks"), "tasks-list");
  assert.equal(resolvePendingPageSurface("/journal"), "journal-day");
  assert.equal(resolvePendingPageSurface("/journal/2026-08-26"), "journal-day");
  assert.equal(resolvePendingPageSurface("/journal/habits"), "journal-habits");
  assert.equal(
    resolvePendingPageSurface("/journal/habits/habit-1"),
    "journal-habits",
  );
  assert.equal(resolvePendingPageSurface("/knowledge"), "knowledge");
  assert.equal(resolvePendingPageSurface("/knowledge/note"), "knowledge");
  assert.equal(resolvePendingPageSurface("/letters"), "letters");
  assert.equal(resolvePendingPageSurface("/letters/l-1"), "letters");
});
