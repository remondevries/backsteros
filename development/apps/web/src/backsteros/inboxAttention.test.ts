import { describe, expect, it } from "vite-plus/test";

import { BACKSTEROS_INBOX_ATTENTION_STATUSES } from "./client";
import { migrateBacksterosTaskStatus } from "./taskStatus";

describe("Backsteros inbox attention statuses", () => {
  it("covers triage, in review, in progress, and on hold", () => {
    expect([...BACKSTEROS_INBOX_ATTENTION_STATUSES]).toEqual([
      "triage",
      "in_review",
      "in_progress",
      "on_hold",
    ]);
  });

  it("keeps migrated statuses stable for inbox membership", () => {
    for (const status of BACKSTEROS_INBOX_ATTENTION_STATUSES) {
      expect(migrateBacksterosTaskStatus(status)).toBe(status);
    }
  });
});
