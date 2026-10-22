import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWaitingStatusPatch,
  defaultWaitingFollowUpDateIso,
} from "./task-waiting.js";

describe("task waiting helpers", () => {
  it("defaults follow-up seven UTC days ahead", () => {
    const now = new Date("2026-10-22T12:00:00.000Z");
    assert.equal(
      defaultWaitingFollowUpDateIso(now),
      "2026-10-29T12:00:00.000Z",
    );
  });

  it("omits followUpDate when one is already set", () => {
    assert.deepEqual(
      buildWaitingStatusPatch({
        currentFollowUpDate: "2026-11-01T00:00:00.000Z",
      }),
      { status: "waiting" },
    );
  });
});
