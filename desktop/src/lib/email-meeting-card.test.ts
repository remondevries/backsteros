import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatEmailAgentMeetingCardComment,
  parseEmailAgentMeetingCard,
} from "./email-meeting-card.ts";

describe("email-meeting-card", () => {
  it("round-trips a MEETING_CARD fence with badges", () => {
    const body = formatEmailAgentMeetingCardComment({
      meetingId: "m-1",
      title: "Testing meeting",
      href: "/calendar/meetings/m-1",
      displayId: "M-12",
      number: 12,
      startAt: "2026-09-24T15:00:00.000Z",
      endAt: "2026-09-24T16:00:00.000Z",
      projectName: "BacksterOS",
      projectIcon: "box",
      organizationName: "Lemo-Design",
      status: "ready_to_start",
    });
    const parsed = parseEmailAgentMeetingCard(body);
    assert.ok(parsed);
    assert.equal(parsed.card.meetingId, "m-1");
    assert.equal(parsed.card.title, "Testing meeting");
    assert.equal(parsed.card.displayId, "M-12");
    assert.equal(parsed.card.href, "/calendar/meetings/m-1");
  });

  it("parses legacy Created agenda markdown", () => {
    const body =
      "Created agenda **Testing meeting** · [Open](/calendar?meeting=874097997c7c431badeed6ed53312a3b)";
    const parsed = parseEmailAgentMeetingCard(body);
    assert.ok(parsed);
    assert.equal(parsed.card.title, "Testing meeting");
    assert.equal(
      parsed.card.meetingId,
      "874097997c7c431badeed6ed53312a3b",
    );
  });
});
