import { describe, expect, it } from "vite-plus/test";

import {
  BACKSTEROS_NO_DUE_DATE_VALUE,
  BACKSTEROS_PICK_DUE_DATE_VALUE,
  buildTaskDueDateDropdownOptions,
  formatLocalYmd,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
  toApiDueDateIso,
} from "./taskDueDate";

describe("taskDueDate", () => {
  it("formats relative due labels", () => {
    const today = formatLocalYmd(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatTaskDueMetaLabel(today)).toBe("Today");
    expect(formatTaskDueMetaLabel(formatLocalYmd(tomorrow))).toBe("Tomorrow");
  });

  it("builds preset options like desktop", () => {
    const now = new Date(2026, 8, 4);
    const options = buildTaskDueDateDropdownOptions(null, now);
    expect(options.map((option) => option.label)).toEqual([
      "Today",
      "Tomorrow",
      "In one week",
      "Pick a date…",
      "No due date",
    ]);
    expect(options.at(-2)?.value).toBe(BACKSTEROS_PICK_DUE_DATE_VALUE);
    expect(options.at(-1)?.value).toBe(BACKSTEROS_NO_DUE_DATE_VALUE);
  });

  it("converts local ymd to api iso and computes urgency", () => {
    expect(toApiDueDateIso("2026-09-04")?.startsWith("2026-09-0")).toBe(true);
    expect(getTaskDueDateUrgency("2020-01-01")).toBe("overdue");
    expect(getTaskDueDateUrgency(formatLocalYmd(new Date()))).toBe("due_today");
  });
});
