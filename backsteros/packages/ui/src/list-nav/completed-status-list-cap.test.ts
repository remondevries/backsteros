import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPLETED_STATUS_LIST_INITIAL_VISIBLE,
  COMPLETED_STATUS_LIST_PAGE_SIZE,
  mapStatusGroupsWithCompletedCap,
  nextCompletedStatusVisibleCount,
  sliceCompletedStatusItems,
} from "./completed-status-list-cap.js";

test("sliceCompletedStatusItems returns all when under the limit", () => {
  const items = [1, 2, 3];
  assert.deepEqual(sliceCompletedStatusItems(items, 50), {
    visibleItems: items,
    hiddenCount: 0,
  });
});

test("sliceCompletedStatusItems caps and reports hidden count", () => {
  const items = Array.from({ length: 60 }, (_, i) => i);
  const sliced = sliceCompletedStatusItems(
    items,
    COMPLETED_STATUS_LIST_INITIAL_VISIBLE,
  );
  assert.equal(sliced.visibleItems.length, 50);
  assert.equal(sliced.hiddenCount, 10);
  assert.deepEqual(sliced.visibleItems, items.slice(0, 50));
});

test("nextCompletedStatusVisibleCount pages up to total", () => {
  assert.equal(
    nextCompletedStatusVisibleCount(50, 120, COMPLETED_STATUS_LIST_PAGE_SIZE),
    100,
  );
  assert.equal(nextCompletedStatusVisibleCount(100, 120), 120);
  assert.equal(nextCompletedStatusVisibleCount(120, 120), 120);
});

test("mapStatusGroupsWithCompletedCap only slices completed", () => {
  const groups = [
    { status: "triage", items: [1, 2] },
    {
      status: "completed",
      items: Array.from({ length: 55 }, (_, i) => i),
    },
  ];
  const mapped = mapStatusGroupsWithCompletedCap(groups, 50);
  assert.equal(mapped[0]?.hiddenCount, 0);
  assert.equal(mapped[0]?.items.length, 2);
  assert.equal(mapped[1]?.hiddenCount, 5);
  assert.equal(mapped[1]?.items.length, 50);
});
