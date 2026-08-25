import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  naturalLanguageMeetingSchedulePreview,
  parseNaturalLanguageMeetingSchedule,
} from "./parse-natural-language-meeting-schedule.js";

describe("parseNaturalLanguageMeetingSchedule", () => {
  const ref = new Date(2026, 7, 23, 10, 0, 0); // Sun Aug 23, 2026 10:00

  it("parses explicit ranges", () => {
    const result = parseNaturalLanguageMeetingSchedule(
      "tomorrow 2pm to 4pm",
      ref,
    );
    assert.equal(result.kind, "range");
    if (result.kind !== "range") return;

    assert.equal(result.startAt.getFullYear(), 2026);
    assert.equal(result.startAt.getMonth(), 7);
    assert.equal(result.startAt.getDate(), 24);
    assert.equal(result.startAt.getHours(), 14);
    assert.equal(result.endAt.getHours(), 16);
  });

  it("parses duration suffixes", () => {
    const result = parseNaturalLanguageMeetingSchedule(
      "tomorrow at 2pm for 1 hour",
      ref,
    );
    assert.equal(result.kind, "range");
    if (result.kind !== "range") return;

    assert.equal(result.startAt.getDate(), 24);
    assert.equal(result.startAt.getHours(), 14);
    assert.equal(result.endAt.getHours(), 15);
  });

  it("defaults to a one-hour block when only a start time is parsed", () => {
    const result = parseNaturalLanguageMeetingSchedule("tomorrow at 3pm", ref);
    assert.equal(result.kind, "range");
    if (result.kind !== "range") return;

    assert.equal(result.startAt.getHours(), 15);
    assert.equal(result.endAt.getHours(), 16);
  });

  it("supports clear intent", () => {
    assert.equal(
      parseNaturalLanguageMeetingSchedule("clear schedule", ref).kind,
      "clear",
    );
    assert.equal(
      parseNaturalLanguageMeetingSchedule("no time", ref).kind,
      "clear",
    );
  });

  it("returns preview labels for valid input", () => {
    const preview = naturalLanguageMeetingSchedulePreview(
      "tomorrow 2pm to 4pm",
      ref,
    );
    assert.match(preview ?? "", /^Set to /);
  });
});
