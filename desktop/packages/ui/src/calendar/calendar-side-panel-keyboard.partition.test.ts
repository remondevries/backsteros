import assert from "node:assert/strict";
import { test } from "node:test";

import { partitionCalendarSidePanelMeetings } from "./calendar-side-panel-keyboard.js";

test("partitionCalendarSidePanelMeetings splits triage inbox meetings from scheduled", () => {
  const { inboxMeetings, scheduledMeetings } =
    partitionCalendarSidePanelMeetings([
      {
        id: "scheduled",
        title: "Weekly sync",
        number: 1,
        status: "on_hold",
        startAt: "2026-08-22T10:00:00.000Z",
        endAt: "2026-08-22T11:00:00.000Z",
      },
      {
        id: "triage",
        title: "Portal booking",
        number: 2,
        status: "triage",
        startAt: "2026-08-25T10:00:00.000Z",
        endAt: "2026-08-25T11:00:00.000Z",
      },
    ]);

  assert.deepEqual(
    inboxMeetings.map((meeting) => meeting.id),
    ["triage"],
  );
  assert.deepEqual(
    scheduledMeetings.map((meeting) => meeting.id),
    ["scheduled"],
  );
});
