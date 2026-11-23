import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeGoogleAttendees } from "../lib/google-calendar-attendees.js";

describe("mergeGoogleAttendees", () => {
  it("adds Backster emails without dropping Google-only guests", () => {
    const merged = mergeGoogleAttendees({
      existing: [
        { email: "google-only@example.com", responseStatus: "accepted" },
        { email: "old@example.com", responseStatus: "needsAction" },
      ],
      previousBacksterEmails: ["old@example.com"],
      nextBacksterEmails: ["new@example.com"],
    });
    assert.deepEqual(
      merged.map((attendee) => attendee.email),
      ["new@example.com", "google-only@example.com"],
    );
    assert.equal(
      merged.find((attendee) => attendee.email === "google-only@example.com")
        ?.responseStatus,
      "accepted",
    );
  });

  it("keeps RSVP state when a Backster guest was already on the event", () => {
    const merged = mergeGoogleAttendees({
      existing: [{ email: "Ada <ada@example.com>", responseStatus: "tentative" }],
      previousBacksterEmails: ["ada@example.com"],
      nextBacksterEmails: ["ada@example.com"],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.email, "ada@example.com");
    assert.equal(merged[0]?.responseStatus, "tentative");
  });

  it("removes a Backster guest that was dropped locally", () => {
    const merged = mergeGoogleAttendees({
      existing: [
        { email: "keep@example.com" },
        { email: "drop@example.com" },
      ],
      previousBacksterEmails: ["keep@example.com", "drop@example.com"],
      nextBacksterEmails: ["keep@example.com"],
    });
    assert.deepEqual(
      merged.map((attendee) => attendee.email),
      ["keep@example.com"],
    );
  });
});
