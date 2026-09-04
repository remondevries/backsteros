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

  it("does not spawn on local-core (cloud leader owns due ticks)", () => {
    assert.ok(src.includes("shouldRunRecurringTaskSpawner"));
    assert.ok(
      src.includes(
        'process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() !== "local"',
      ),
    );
  });

  it("emits ordered task + recurring_task sync_events when a template spawns", () => {
    assert.ok(src.includes("recordTaskRestSyncEvent"));
    assert.ok(src.includes("recordRecurringTaskRestSyncEvent"));
  });
});
