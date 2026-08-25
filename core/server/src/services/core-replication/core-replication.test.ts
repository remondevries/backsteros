import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyReplicationSecret } from "./auth.js";
import {
  AGENTS_DOOR_HOSTNAMES,
  BOOTSTRAP_TABLES,
  CALENDAR_BUSY_TASK_LEGACY_SOURCE,
  LEGACY_BOOTSTRAP_API_KEY_NAME,
  REPLICATED_TABLES,
} from "./constants.js";
import {
  InvalidReplicationPeerUrlError,
  assertReplicationListenHost,
  getCoreReplicationConfig,
  validateReplicationPeerUrl,
} from "./config.js";
import {
  calendarBusyTaskFilterSql,
  isCalendarBusyTaskRow,
  preferIncomingOnConflict,
  shouldApplyByUpdatedAt,
} from "./rules.js";
import { listReplicatedTableSpecs } from "./tables.js";

describe("core-replication constants", () => {
  it("live sync covers api_keys plus meetings stack", () => {
    assert.deepEqual(REPLICATED_TABLES, [
      "meeting_scheduling_settings",
      "meetings",
      "tasks",
      "api_keys",
    ]);
    assert.ok(BOOTSTRAP_TABLES.includes("workspaces"));
    assert.ok(BOOTSTRAP_TABLES.includes("workspace_settings"));
    assert.ok(BOOTSTRAP_TABLES.includes("entity_counters"));
    assert.ok(BOOTSTRAP_TABLES.includes("api_keys"));
    for (const table of REPLICATED_TABLES) {
      assert.ok(BOOTSTRAP_TABLES.includes(table));
    }
  });

  it("documents legacy Meetings-only bootstrap", () => {
    assert.equal(LEGACY_BOOTSTRAP_API_KEY_NAME, "Meetings");
  });

  it("registers handlers for the full replicated stack", () => {
    const names = listReplicatedTableSpecs().map((spec) => spec.name);
    assert.deepEqual(names, [...REPLICATED_TABLES]);
    const tasks = listReplicatedTableSpecs().find((spec) => spec.name === "tasks");
    assert.match(tasks?.whereSql ?? "", new RegExp(CALENDAR_BUSY_TASK_LEGACY_SOURCE));
  });
});

describe("core-replication peer URL", () => {
  it("rejects the public agents door hostname", () => {
    for (const hostname of AGENTS_DOOR_HOSTNAMES) {
      assert.throws(
        () => validateReplicationPeerUrl(`https://${hostname}`),
        InvalidReplicationPeerUrlError,
      );
    }
  });

  it("accepts Tailscale and localhost peer URLs", () => {
    assert.equal(
      validateReplicationPeerUrl("http://macbook.tail1234.ts.net:8788/").peerUrl,
      "http://macbook.tail1234.ts.net:8788",
    );
    assert.equal(
      validateReplicationPeerUrl("http://127.0.0.1:8788").hostname,
      "127.0.0.1",
    );
  });

  it("throws on invalid peer URL at config load", () => {
    assert.throws(
      () =>
        getCoreReplicationConfig({
          CORE_REPLICATION_PEER_URL: "https://agent.backsteros.com",
          CORE_REPLICATION_SECRET: "secret",
        }),
      InvalidReplicationPeerUrlError,
    );
  });
});

describe("core-replication security", () => {
  it("uses timing-safe secret compare", () => {
    assert.equal(verifyReplicationSecret("abc", "abc"), true);
    assert.equal(verifyReplicationSecret("abc", "abd"), false);
    assert.equal(verifyReplicationSecret("a", "aa"), false);
  });

  it("rejects binding 0.0.0.0 when replication is enabled", () => {
    assert.throws(
      () =>
        assertReplicationListenHost("0.0.0.0", {
          CORE_REPLICATION_PEER_URL: "http://127.0.0.1:8789",
          CORE_REPLICATION_SECRET: "secret",
        }),
      /bound to all interfaces/,
    );
    assert.doesNotThrow(() => assertReplicationListenHost("127.0.0.1", {}));
  });
});

describe("core-replication rules", () => {
  it("prefers local settings and cloud meetings/tasks on equal timestamps", () => {
    const ts = new Date("2026-01-01T00:00:00.000Z");
    assert.equal(
      shouldApplyByUpdatedAt("meeting_scheduling_settings", "cloud", ts, ts),
      "apply",
    );
    assert.equal(shouldApplyByUpdatedAt("meetings", "local", ts, ts), "apply");
    assert.equal(shouldApplyByUpdatedAt("tasks", "local", ts, ts), "apply");
    assert.equal(
      preferIncomingOnConflict("meeting_scheduling_settings", "cloud"),
      true,
    );
    assert.equal(preferIncomingOnConflict("meetings", "local"), true);
  });

  it("filters calendar-busy tasks", () => {
    assert.match(calendarBusyTaskFilterSql(), /calendar_busy/);
    assert.equal(
      isCalendarBusyTaskRow({ legacy_source: CALENDAR_BUSY_TASK_LEGACY_SOURCE }),
      true,
    );
    assert.equal(isCalendarBusyTaskRow({ legacy_source: "circle" }), false);
  });
});
