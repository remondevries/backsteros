import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveSyncedOrRestRows } from "./resolve-synced-or-rest-rows.ts";

test("connected prefers local even when REST differs", () => {
  const rows = resolveSyncedOrRestRows({
    localRows: [{ id: "a" }, { id: "b" }],
    restRows: [{ id: "a" }],
    connected: true,
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b"],
  );
});

test("disconnected prefers REST so removals leave the list", () => {
  const rows = resolveSyncedOrRestRows({
    localRows: [{ id: "a" }, { id: "b" }, { id: "c" }],
    restRows: [{ id: "a" }],
    connected: false,
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a"],
  );
});

test("disconnected falls back to local until REST loads", () => {
  const rows = resolveSyncedOrRestRows({
    localRows: [{ id: "stale" }],
    restRows: null,
    connected: false,
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["stale"],
  );
});

test("connected with empty local uses REST while sync fills", () => {
  const rows = resolveSyncedOrRestRows({
    localRows: [],
    restRows: [{ id: "from-api" }],
    connected: true,
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["from-api"],
  );
});
