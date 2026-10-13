import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { measureCalendarStripHourPitchPx } from "./use-calendar-week-strip-axis-rail.js";

function stubRect(height: number, top = 0): DOMRect {
  return {
    height,
    width: 100,
    top,
    left: 0,
    bottom: top + height,
    right: 100,
    x: 0,
    y: top,
    toJSON() {
      return {};
    },
  };
}

describe("measureCalendarStripHourPitchPx", () => {
  it("averages table height so a short first slot does not under-pitch labels", () => {
    const table = {
      getBoundingClientRect: () => stubRect(866),
    };
    const pane = {
      querySelector: (selector: string) => {
        if (selector === ".fc-timegrid-slots table") return table;
        return null;
      },
      querySelectorAll: (selector: string) => {
        if (selector === ".fc-timegrid-slots tr") {
          return { length: 48 };
        }
        return { length: 0 };
      },
    } as unknown as HTMLElement;

    assert.equal(measureCalendarStripHourPitchPx(pane), 866 / 24);
  });

  it("falls back to midnight→1am distance", () => {
    const midnight = {
      getBoundingClientRect: () => stubRect(17.5, 0),
    };
    const oneAm = {
      getBoundingClientRect: () => stubRect(18, 35.625),
    };
    const pane = {
      querySelector: (selector: string) => {
        if (selector === ".fc-timegrid-slots table") return null;
        if (selector === '.fc-timegrid-slot[data-time="00:00:00"]') {
          return midnight;
        }
        if (selector === '.fc-timegrid-slot[data-time="01:00:00"]') {
          return oneAm;
        }
        return null;
      },
      querySelectorAll: () => ({ length: 0 }),
    } as unknown as HTMLElement;

    assert.equal(measureCalendarStripHourPitchPx(pane), 35.625);
  });
});
