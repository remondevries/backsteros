import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("recurring task runner hybrid", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "recurring-tasks.ts"),
    "utf8",
  );

  it("uses hybrid scheduled-job leadership (local-primary, cloud fallback)", () => {
    assert.ok(src.includes("shouldRunHybridScheduledJob"));
  });

  it("emits ordered task + recurring_task sync_events when a template spawns", () => {
    assert.ok(src.includes("recordTaskRestSyncEvent"));
    assert.ok(src.includes("recordRecurringTaskRestSyncEvent"));
  });
});
