import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCoreReplicationConfig } from "./config.js";
import { clearReplicationPeerReachabilityCache } from "./peer-reachability.js";
import {
  isHybridScheduledJobExplicitlyDisabled,
  shouldRunHybridScheduledJob,
} from "./scheduled-job-leadership.js";

describe("shouldRunHybridScheduledJob", () => {
  it("returns false when disabled via env", async () => {
    const run = await shouldRunHybridScheduledJob("MEETING_PORTAL_REMINDER_SCHEDULER", {
      MEETING_PORTAL_REMINDER_SCHEDULER: "0",
    });
    assert.equal(run, false);
  });

  it("returns true on standalone core (no replication)", async () => {
    const run = await shouldRunHybridScheduledJob(undefined, {});
    assert.equal(run, true);
  });

  it("returns true on local-core when hybrid is configured", async () => {
    const run = await shouldRunHybridScheduledJob(undefined, {
      CORE_REPLICATION_ROLE: "local",
      CORE_REPLICATION_PEER_URL: "http://127.0.0.1:8789",
      CORE_REPLICATION_SECRET: "test-secret",
    });
    assert.equal(run, true);
  });
});

describe("isHybridScheduledJobExplicitlyDisabled", () => {
  it("detects scheduler disabled flag", () => {
    assert.equal(
      isHybridScheduledJobExplicitlyDisabled("MEETING_PORTAL_REMINDER_SCHEDULER", {
        MEETING_PORTAL_REMINDER_SCHEDULER: "0",
      }),
      true,
    );
    assert.equal(
      isHybridScheduledJobExplicitlyDisabled("MEETING_PORTAL_REMINDER_SCHEDULER", {}),
      false,
    );
  });
});

describe("getCoreReplicationConfig cloud role", () => {
  it("parses cloud role for peer ping leadership tests", () => {
    const config = getCoreReplicationConfig({
      CORE_REPLICATION_ROLE: "cloud",
      CORE_REPLICATION_PEER_URL: "http://127.0.0.1:8788",
      CORE_REPLICATION_SECRET: "test-secret",
    });
    assert.ok(config);
    assert.equal(config.role, "cloud");
  });
});

describe("peer reachability cache", () => {
  it("clears cached reachability between tests", () => {
    clearReplicationPeerReachabilityCache();
    assert.ok(true);
  });
});
