import { describe, expect, it } from "vite-plus/test";

import { buildWaitingStatusPatch, defaultWaitingFollowUpDateIso } from "./taskWaiting";

describe("task waiting helpers", () => {
  it("defaults follow-up seven UTC days ahead", () => {
    const now = new Date("2026-10-22T12:00:00.000Z");
    expect(defaultWaitingFollowUpDateIso(now)).toBe("2026-10-29T12:00:00.000Z");
  });

  it("omits followUpDate when one is already set", () => {
    expect(
      buildWaitingStatusPatch({
        currentFollowUpDate: "2026-11-01T00:00:00.000Z",
      }),
    ).toEqual({ status: "waiting" });
  });

  it("includes a default followUpDate when none is set", () => {
    const now = new Date("2026-10-22T12:00:00.000Z");
    expect(buildWaitingStatusPatch({ now })).toEqual({
      status: "waiting",
      followUpDate: "2026-10-29T12:00:00.000Z",
    });
  });
});
