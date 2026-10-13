import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTimetrackingAreaBreakdown,
  buildTimetrackingContactBreakdown,
  buildTimetrackingProjectBreakdown,
  formatTimetrackingHumanDuration,
} from "./calendar-timetracking-breakdown.js";
import type { TimetrackingEntry } from "./calendar-timetracking-entries.js";

const entries: TimetrackingEntry[] = [
  {
    id: "t1",
    kind: "task",
    title: "Ship",
    trackedDurationSeconds: 7200,
    groupDateYmd: "2026-09-17",
    href: "/t1",
    projectId: "p1",
    projectKey: "BSH",
    projectName: "BacksterOS",
    relatedContactIds: ["c1", "c2"],
  },
  {
    id: "m1",
    kind: "meeting",
    title: "Sync",
    trackedDurationSeconds: 3600,
    groupDateYmd: "2026-09-17",
    href: "/m1",
    projectId: "p1",
    projectKey: "BSH",
    projectName: "BacksterOS",
    relatedContactIds: ["c1"],
  },
  {
    id: "t2",
    kind: "task",
    title: "Loose",
    trackedDurationSeconds: 1800,
    groupDateYmd: "2026-09-17",
    href: "/t2",
    relatedContactIds: [],
  },
];

test("buildTimetrackingProjectBreakdown groups by project", () => {
  const slices = buildTimetrackingProjectBreakdown(entries);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]?.label, "BacksterOS");
  assert.equal(slices[0]?.seconds, 10800);
  assert.equal(slices[1]?.label, "No project");
  assert.equal(slices[1]?.seconds, 1800);
});

test("buildTimetrackingContactBreakdown splits related contacts equally", () => {
  const slices = buildTimetrackingContactBreakdown(entries, {
    c1: "Ada",
    c2: "Ben",
  });
  assert.equal(slices.length, 2);
  const ada = slices.find((slice) => slice.id === "c1");
  const ben = slices.find((slice) => slice.id === "c2");
  // t1: 7200/2=3600 each; m1: 3600 to c1 → Ada 7200, Ben 3600
  assert.equal(ada?.seconds, 7200);
  assert.equal(ada?.label, "Ada");
  assert.equal(ben?.seconds, 3600);
  assert.equal(ben?.label, "Ben");
});

test("buildTimetrackingAreaBreakdown groups by area", () => {
  const withAreas: TimetrackingEntry[] = [
    {
      ...entries[0]!,
      areaId: "area-work",
      areaName: "Work",
      areaColor: "#2dd4bf",
    },
    {
      ...entries[1]!,
      areaId: "area-work",
      areaName: "Work",
      areaColor: "#2dd4bf",
    },
    {
      ...entries[2]!,
      areaId: null,
      areaName: null,
    },
  ];
  const slices = buildTimetrackingAreaBreakdown(withAreas);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]?.label, "Work");
  assert.equal(slices[0]?.seconds, 10800);
  assert.equal(slices[0]?.color, "#2dd4bf");
  assert.equal(slices[1]?.label, "No area");
  assert.equal(slices[1]?.seconds, 1800);
});

test("buildTimetrackingAreaBreakdown accepts top-level project areas", () => {
  const withTopLevel: TimetrackingEntry[] = [
    {
      ...entries[0]!,
      areaId: "clients",
      areaName: "Clients",
    },
    {
      ...entries[1]!,
      areaId: "business",
      areaName: "Business",
    },
  ];
  const slices = buildTimetrackingAreaBreakdown(withTopLevel);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]?.label, "Clients");
  assert.equal(slices[0]?.seconds, 7200);
  assert.equal(slices[1]?.label, "Business");
  assert.equal(slices[1]?.seconds, 3600);
});

test("formatTimetrackingHumanDuration", () => {
  assert.equal(formatTimetrackingHumanDuration(56 * 60), "56 min");
  assert.equal(formatTimetrackingHumanDuration(2 * 3600), "2hr");
  assert.equal(formatTimetrackingHumanDuration(2 * 3600 + 11 * 60), "2hr 11 min");
});
