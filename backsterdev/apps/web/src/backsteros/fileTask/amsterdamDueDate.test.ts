import { describe, expect, it } from "vite-plus/test";

import {
  amsterdamCalendarYmd,
  amsterdamEndOfDayDueDateIso,
  amsterdamWallTimeToUtcIso,
} from "./amsterdamDueDate";

describe("amsterdamDueDate", () => {
  it("formats the Amsterdam calendar day", () => {
    // 2026-07-15 22:30 UTC is still 2026-07-16 00:30 in Amsterdam (CEST).
    expect(amsterdamCalendarYmd(new Date("2026-07-15T22:30:00.000Z"))).toBe("2026-07-16");
  });

  it("maps CEST end-of-day to T21:59:59.000Z", () => {
    expect(amsterdamWallTimeToUtcIso("2026-09-15", 23, 59, 59)).toBe("2026-09-15T21:59:59.000Z");
    expect(amsterdamEndOfDayDueDateIso(new Date("2026-09-15T10:00:00.000Z"))).toBe(
      "2026-09-15T21:59:59.000Z",
    );
  });

  it("maps CET end-of-day to T22:59:59.000Z", () => {
    expect(amsterdamWallTimeToUtcIso("2026-01-15", 23, 59, 59)).toBe("2026-01-15T22:59:59.000Z");
  });
});
