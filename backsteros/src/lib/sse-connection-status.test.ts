import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSseConnectionReporter } from "./sse-connection-status.ts";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createSseConnectionReporter", () => {
  it("reports connecting then live on first success", () => {
    const statuses: string[] = [];
    const reporter = createSseConnectionReporter((s) => statuses.push(s), {
      debounceMs: 20,
    });
    reporter.beginAttempt();
    reporter.live();
    assert.deepEqual(statuses, ["connecting", "live"]);
  });

  it("keeps live across soft recycle attempts", () => {
    const statuses: string[] = [];
    const reporter = createSseConnectionReporter((s) => statuses.push(s), {
      debounceMs: 20,
    });
    reporter.beginAttempt();
    reporter.live();
    reporter.beginAttempt();
    reporter.beginAttempt();
    assert.deepEqual(statuses, ["connecting", "live"]);
  });

  it("does not announce disconnected for a brief failure before live returns", async () => {
    const statuses: string[] = [];
    const reporter = createSseConnectionReporter((s) => statuses.push(s), {
      debounceMs: 40,
    });
    reporter.beginAttempt();
    reporter.live();
    reporter.failed();
    reporter.beginAttempt();
    await wait(15);
    reporter.live();
    await wait(50);
    assert.deepEqual(statuses, ["connecting", "live"]);
  });

  it("announces disconnected after debounce on sustained outage", async () => {
    const statuses: string[] = [];
    const reporter = createSseConnectionReporter((s) => statuses.push(s), {
      debounceMs: 25,
    });
    reporter.beginAttempt();
    reporter.live();
    reporter.failed();
    reporter.beginAttempt();
    await wait(40);
    assert.deepEqual(statuses, ["connecting", "live", "disconnected"]);
    reporter.beginAttempt();
    assert.deepEqual(statuses, ["connecting", "live", "disconnected"]);
    reporter.live();
    assert.deepEqual(statuses, ["connecting", "live", "disconnected", "live"]);
  });

  it("dispose cancels a pending disconnected announce", async () => {
    const statuses: string[] = [];
    const reporter = createSseConnectionReporter((s) => statuses.push(s), {
      debounceMs: 20,
    });
    reporter.beginAttempt();
    reporter.failed();
    reporter.dispose();
    await wait(40);
    assert.deepEqual(statuses, ["connecting"]);
  });
});
