import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTimetrackingSidePanelKeyboardItemIds,
  getSelectedTimetrackingSidePanelItemId,
  parseTimetrackingSidePanelItemId,
} from "../../dist/calendar/calendar-timetracking-keyboard.js";

test("buildTimetrackingSidePanelKeyboardItemIds skips days in collapsed weeks", () => {
  const ids = buildTimetrackingSidePanelKeyboardItemIds(
    [
      {
        monthKey: "2026-08",
        monthLabel: "August 2026",
        weeks: [
          {
            weekKey: "2026-08-18",
            weekNumber: 34,
            days: [
              { ymd: "2026-08-18", label: "Mon", isToday: false },
              { ymd: "2026-08-19", label: "Tue", isToday: false },
            ],
          },
          {
            weekKey: "2026-08-25",
            weekNumber: 35,
            days: [{ ymd: "2026-08-25", label: "Mon", isToday: true }],
          },
        ],
      },
    ],
    new Set(["2026-08-18"]),
  );

  assert.deepEqual(ids, [
    "month:2026-08",
    "week:2026-08-18",
    "week:2026-08-25",
    "day:2026-08-25",
  ]);
});

test("parseTimetrackingSidePanelItemId reads month week and day", () => {
  assert.deepEqual(parseTimetrackingSidePanelItemId("day:2026-08-25"), {
    kind: "day",
    ymd: "2026-08-25",
  });
  assert.deepEqual(parseTimetrackingSidePanelItemId("week:2026-08-18"), {
    kind: "week",
    weekKey: "2026-08-18",
  });
  assert.deepEqual(parseTimetrackingSidePanelItemId("month:2026-08"), {
    kind: "month",
    monthKey: "2026-08",
  });
  assert.equal(parseTimetrackingSidePanelItemId("nope"), null);
});

test("getSelectedTimetrackingSidePanelItemId matches period", () => {
  assert.equal(
    getSelectedTimetrackingSidePanelItemId({
      kind: "day",
      ymd: "2026-08-25",
    }),
    "day:2026-08-25",
  );
  assert.equal(
    getSelectedTimetrackingSidePanelItemId({
      kind: "week",
      weekKey: "2026-08-18",
      weekNumber: 34,
    }),
    "week:2026-08-18",
  );
});
