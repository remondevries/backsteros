import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contactIdsDueForPortalReminder } from "./meeting-portal-reminder-eligibility.js";

describe("contactIdsDueForPortalReminder", () => {
  const now = new Date("2026-09-17T11:00:00.000Z");
  const oneHourMs = 60 * 60 * 1000;

  it("returns invitees inside the 1h window without a reminder", () => {
    const due = contactIdsDueForPortalReminder(
      {
        startAt: new Date("2026-09-17T11:45:00.000Z"),
        attendeeContactIds: ["contact-a"],
        attendeePortalEmails: {
          "contact-a": { inviteSentAt: "2026-09-17T10:00:00.000Z" },
        },
      },
      now,
      oneHourMs,
    );
    assert.deepEqual(due, ["contact-a"]);
  });

  it("skips meetings more than 1h away", () => {
    const due = contactIdsDueForPortalReminder(
      {
        startAt: new Date("2026-09-17T12:30:00.000Z"),
        attendeeContactIds: ["contact-a"],
        attendeePortalEmails: {
          "contact-a": { inviteSentAt: "2026-09-17T10:00:00.000Z" },
        },
      },
      now,
      oneHourMs,
    );
    assert.deepEqual(due, []);
  });

  it("skips attendees who already received a reminder", () => {
    const due = contactIdsDueForPortalReminder(
      {
        startAt: new Date("2026-09-17T11:45:00.000Z"),
        attendeeContactIds: ["contact-a"],
        attendeePortalEmails: {
          "contact-a": {
            inviteSentAt: "2026-09-17T10:00:00.000Z",
            reminderSentAt: "2026-09-17T10:30:00.000Z",
          },
        },
      },
      now,
      oneHourMs,
    );
    assert.deepEqual(due, []);
  });

  it("skips attendees without a prior invite", () => {
    const due = contactIdsDueForPortalReminder(
      {
        startAt: new Date("2026-09-17T11:45:00.000Z"),
        attendeeContactIds: ["contact-a"],
        attendeePortalEmails: {},
      },
      now,
      oneHourMs,
    );
    assert.deepEqual(due, []);
  });
});
