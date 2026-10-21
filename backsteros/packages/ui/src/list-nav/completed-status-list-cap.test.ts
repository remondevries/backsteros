import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPLETED_STATUS_LIST_INITIAL_VISIBLE,
  COMPLETED_STATUS_LIST_PAGE_SIZE,
  isCappedStatusListStatus,
  mapStatusGroupsWithCompletedCap,
  nextCompletedStatusVisibleCount,
  sliceCompletedStatusItems,
} from "./completed-status-list-cap.js";

test("sliceCompletedStatusItems returns all when under the limit", () => {
  const items = [1, 2, 3];
  assert.deepEqual(sliceCompletedStatusItems(items, 25), {
    visibleItems: items,
    hiddenCount: 0,
  });
});

test("sliceCompletedStatusItems caps and reports hidden count", () => {
  const items = Array.from({ length: 40 }, (_, i) => i);
  const sliced = sliceCompletedStatusItems(
    items,
    COMPLETED_STATUS_LIST_INITIAL_VISIBLE,
  );
  assert.equal(sliced.visibleItems.length, 25);
  assert.equal(sliced.hiddenCount, 15);
  assert.deepEqual(sliced.visibleItems, items.slice(0, 25));
});

test("nextCompletedStatusVisibleCount pages up to total", () => {
  assert.equal(
    nextCompletedStatusVisibleCount(25, 80, COMPLETED_STATUS_LIST_PAGE_SIZE),
    50,
  );
  assert.equal(nextCompletedStatusVisibleCount(50, 80), 75);
  assert.equal(nextCompletedStatusVisibleCount(75, 80), 80);
});

test("isCappedStatusListStatus covers terminal groups", () => {
  assert.equal(isCappedStatusListStatus("completed"), true);
  assert.equal(isCappedStatusListStatus("canceled"), true);
  assert.equal(isCappedStatusListStatus("duplicated"), true);
  assert.equal(isCappedStatusListStatus("triage"), false);
});

test("mapStatusGroupsWithCompletedCap slices completed canceled and duplicated", () => {
  const groups = [
    { status: "triage", items: [1, 2] },
    {
      status: "completed",
      items: Array.from({ length: 30 }, (_, i) => i),
    },
    {
      status: "canceled",
      items: Array.from({ length: 28 }, (_, i) => `c${i}`),
    },
    {
      status: "duplicated",
      items: Array.from({ length: 26 }, (_, i) => `d${i}`),
    },
  ];
  const mapped = mapStatusGroupsWithCompletedCap(groups, {
    completed: 25,
    canceled: 25,
    duplicated: 25,
  });
  assert.equal(mapped[0]?.hiddenCount, 0);
  assert.equal(mapped[0]?.items.length, 2);
  assert.equal(mapped[1]?.hiddenCount, 5);
  assert.equal(mapped[1]?.items.length, 25);
  assert.equal(mapped[2]?.hiddenCount, 3);
  assert.equal(mapped[2]?.items.length, 25);
  assert.equal(mapped[3]?.hiddenCount, 1);
  assert.equal(mapped[3]?.items.length, 25);
});

test("mapStatusGroupsWithCompletedCap accepts a shared numeric cap", () => {
  const groups = [
    {
      status: "canceled",
      items: Array.from({ length: 30 }, (_, i) => i),
    },
  ];
  const mapped = mapStatusGroupsWithCompletedCap(groups, 25);
  assert.equal(mapped[0]?.items.length, 25);
  assert.equal(mapped[0]?.hiddenCount, 5);
});
