import { describe, expect, it } from "vite-plus/test";

import { BACKSTEROS_INBOX_ATTENTION_STATUSES } from "./client";
import { migrateBacksterosTaskStatus } from "./taskStatus";

describe("Backsteros inbox attention statuses", () => {
  it("covers triage, in review, and in progress", () => {
    expect([...BACKSTEROS_INBOX_ATTENTION_STATUSES]).toEqual([
      "triage",
      "in_review",
      "in_progress",
    ]);
  });

  it("keeps migrated statuses stable for inbox membership", () => {
    for (const status of BACKSTEROS_INBOX_ATTENTION_STATUSES) {
      expect(migrateBacksterosTaskStatus(status)).toBe(status);
    }
  });
});
