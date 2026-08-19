import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HabitMonthGrid } from "./habit-month-grid.js";
import {
  deriveHabitTimelineMinimapItems,
  habitTimelineSectionId,
  resolveHabitTimelineMinimapHasPersistentGutter,
  resolveHabitTimelineMinimapHeightStyle,
  resolveHabitTimelineMinimapHitStripWidth,
  resolveHabitTimelineMinimapIndexFromPointer,
  resolveHabitTimelineMinimapInteractiveWidth,
  resolveHabitTimelineMinimapTopPercent,
} from "./habit-timeline-minimap.js";

function grid(
  partial: Pick<HabitMonthGrid, "year" | "month" | "label"> & {
    firstYmd?: string;
  },
): HabitMonthGrid {
  return {
    year: partial.year,
    month: partial.month,
    label: partial.label,
    daysInMonth: 1,
    cells: [
      {
        id: partial.firstYmd ?? "2026-01-01",
        ymd: partial.firstYmd ?? "2026-01-01",
        day: 1,
        state: "empty",
      },
    ],
  };
}

describe("habit timeline minimap helpers", () => {
  it("sizes the rail from item spacing", () => {
    assert.equal(
      resolveHabitTimelineMinimapHeightStyle(5),
      "min(32px, calc(100% - 2rem))",
    );
  });

  it("maps pointer Y to the nearest item index", () => {
    assert.equal(resolveHabitTimelineMinimapTopPercent(2, 5), 50);
    assert.equal(
      resolveHabitTimelineMinimapIndexFromPointer({
        itemCount: 5,
        railTop: 0,
        railHeight: 100,
        pointerY: 50,
      }),
      2,
    );
  });

  it("only keeps a persistent gutter when side space is wide enough", () => {
    assert.equal(resolveHabitTimelineMinimapHasPersistentGutter(832), false);
    assert.equal(resolveHabitTimelineMinimapHasPersistentGutter(896), true);
  });

  it("caps the hit strip to the side gutter", () => {
    assert.equal(resolveHabitTimelineMinimapHitStripWidth(768), 0);
    // (900 - 800) / 2 = 50 → min(40, 50 - 12) = 38
    assert.equal(resolveHabitTimelineMinimapHitStripWidth(900), 38);
    assert.equal(
      resolveHabitTimelineMinimapInteractiveWidth(40, true),
      "14rem",
    );
  });

  it("derives items in future-first visual order", () => {
    const items = deriveHabitTimelineMinimapItems([
      grid({ year: 2026, month: 1, label: "January 2026", firstYmd: "2026-01-01" }),
      grid({ year: 2026, month: 2, label: "February 2026", firstYmd: "2026-02-01" }),
    ]);
    assert.equal(items[0]?.label, "February 2026");
    assert.equal(items[1]?.label, "January 2026");
    assert.equal(
      items[0]?.id,
      habitTimelineSectionId(
        grid({ year: 2026, month: 2, label: "February 2026", firstYmd: "2026-02-01" }),
      ),
    );
  });
});
