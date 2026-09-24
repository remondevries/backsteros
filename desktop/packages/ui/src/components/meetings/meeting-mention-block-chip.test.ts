import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMeetingWhenBadge } from "./meeting-mention-block-chip.tsx";

describe("formatMeetingWhenBadge", () => {
  it("formats same-day start and end as a date · time range", () => {
    const label = formatMeetingWhenBadge(
      new Date(2026, 8, 24, 15, 0, 0),
      new Date(2026, 8, 24, 16, 0, 0),
    );
    assert.ok(label);
    assert.match(label, /Sep/);
    assert.match(label, /24/);
    assert.match(label, /–/);
  });

  it("formats start-only when end is missing", () => {
    const label = formatMeetingWhenBadge(new Date(2026, 8, 24, 15, 0, 0));
    assert.ok(label);
    assert.match(label, /Sep/);
    assert.match(label, /·/);
  });
});
