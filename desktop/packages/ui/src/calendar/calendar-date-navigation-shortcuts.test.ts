import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveCalendarDateNavigationAction,
} from "./calendar-date-navigation-shortcuts.js";

test("resolveCalendarDateNavigationAction maps arrow keys to prev/next", () => {
  assert.equal(resolveCalendarDateNavigationAction("ArrowLeft"), "prev");
  assert.equal(resolveCalendarDateNavigationAction("ArrowRight"), "next");
  assert.equal(resolveCalendarDateNavigationAction("ArrowUp"), null);
});

test("resolveCalendarDateNavigationAction ignores modified arrow keys", () => {
  assert.equal(
    resolveCalendarDateNavigationAction("ArrowLeft", { shiftKey: true }),
    null,
  );
  assert.equal(
    resolveCalendarDateNavigationAction("ArrowRight", { metaKey: true }),
    null,
  );
});
