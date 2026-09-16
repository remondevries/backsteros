import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calendarStripCenterIndex,
  calendarStripCenterScrollOffset,
  calendarStripRecycleShift,
} from "./calendar-strip-geometry.js";

test("calendarStripCenterIndex picks the middle pane", () => {
  assert.equal(calendarStripCenterIndex(3), 1);
  assert.equal(calendarStripCenterIndex(5), 2);
  assert.equal(calendarStripCenterIndex(12), 5);
});

test("calendarStripRecycleShift is 0 while away from the edges", () => {
  assert.equal(
    calendarStripRecycleShift({
      scrollOffset: 600 * 5,
      paneSize: 600,
      paneCount: 12,
      edgeBuffer: 2,
    }),
    0,
  );
});

test("calendarStripRecycleShift recenters from the outer edges", () => {
  assert.equal(
    calendarStripRecycleShift({
      scrollOffset: 0,
      paneSize: 600,
      paneCount: 5,
      edgeBuffer: 1,
    }),
    -2,
  );
  assert.equal(
    calendarStripRecycleShift({
      scrollOffset: 2400,
      paneSize: 600,
      paneCount: 5,
      edgeBuffer: 1,
    }),
    2,
  );
});

test("calendarStripRecycleShift proactive buffer for a year window", () => {
  // Pane index 1 of 12 with edgeBuffer 2 → shift so that pane becomes center 5
  assert.equal(
    calendarStripRecycleShift({
      scrollOffset: 600,
      paneSize: 600,
      paneCount: 12,
      edgeBuffer: 2,
    }),
    1 - 5,
  );
  assert.equal(
    calendarStripRecycleShift({
      scrollOffset: 600 * 10,
      paneSize: 600,
      paneCount: 12,
      edgeBuffer: 2,
    }),
    10 - 5,
  );
});

test("calendarStripCenterScrollOffset", () => {
  assert.equal(calendarStripCenterScrollOffset(400, 5), 800);
});
