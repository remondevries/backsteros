import assert from "node:assert/strict";
import { test } from "node:test";

import { buildInboxMeetingListItem } from "../inbox/inbox-items.js";
import { buildMeetingListItemCardData } from "./meeting-list-item-card.js";

test("buildMeetingListItemCardData maps inbox meeting rows", () => {
  const meeting = buildInboxMeetingListItem({
    id: "meet-1",
    title: "Portal booking",
    number: 7,
    status: "triage",
    priority: 2,
    projectName: "BacksterOS",
    projectKey: "BSH",
    startAt: new Date(2026, 7, 1, 10, 0).toISOString(),
    endAt: new Date(2026, 7, 1, 11, 0).toISOString(),
    updatedAt: 1,
  });

  const card = buildMeetingListItemCardData(meeting);
  assert.equal(card.title, "Portal booking");
  assert.equal(card.number, 7);
  assert.equal(card.status, "triage");
  assert.equal(card.priority, 2);
  assert.equal(card.projectName, "BacksterOS");
  assert.equal(card.scheduleLabel, meeting.scheduleLabel);
});
