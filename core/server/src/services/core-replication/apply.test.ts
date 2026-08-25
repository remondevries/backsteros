import assert from "node:assert/strict";
import test from "node:test";

import {
  isBusyTaskRow,
  shouldApplyReplicationChange,
} from "./rules.js";

test("isBusyTaskRow requires due window and no delete", () => {
  assert.equal(
    isBusyTaskRow({
      dueDate: new Date("2026-08-24T09:00:00Z"),
      dueEndDate: new Date("2026-08-24T10:00:00Z"),
    }),
    true,
  );
  assert.equal(
    isBusyTaskRow({
      dueDate: new Date("2026-08-24T09:00:00Z"),
      dueEndDate: null,
    }),
    false,
  );
  assert.equal(
    isBusyTaskRow({
      dueDate: new Date("2026-08-24T09:00:00Z"),
      dueEndDate: new Date("2026-08-24T10:00:00Z"),
      deletedAt: new Date(),
    }),
    false,
  );
});

test("shouldApplyReplicationChange uses updated_at ordering", () => {
  const at = new Date("2026-08-24T10:00:00Z");
  const later = new Date("2026-08-24T11:00:00Z");
  assert.equal(
    shouldApplyReplicationChange({
      table: "meetings",
      existingUpdatedAt: at,
      incomingUpdatedAt: later,
      incomingOrigin: "local",
    }),
    true,
  );
  assert.equal(
    shouldApplyReplicationChange({
      table: "meetings",
      existingUpdatedAt: later,
      incomingUpdatedAt: at,
      incomingOrigin: "cloud",
    }),
    false,
  );
});

test("shouldApplyReplicationChange tie-breakers favor local settings and cloud meetings", () => {
  const at = new Date("2026-08-24T10:00:00Z");
  assert.equal(
    shouldApplyReplicationChange({
      table: "meeting_scheduling_settings",
      existingUpdatedAt: at,
      incomingUpdatedAt: at,
      incomingOrigin: "local",
    }),
    true,
  );
  assert.equal(
    shouldApplyReplicationChange({
      table: "meeting_scheduling_settings",
      existingUpdatedAt: at,
      incomingUpdatedAt: at,
      incomingOrigin: "cloud",
    }),
    false,
  );
  assert.equal(
    shouldApplyReplicationChange({
      table: "meetings",
      existingUpdatedAt: at,
      incomingUpdatedAt: at,
      incomingOrigin: "cloud",
    }),
    true,
  );
  assert.equal(
    shouldApplyReplicationChange({
      table: "meetings",
      existingUpdatedAt: at,
      incomingUpdatedAt: at,
      incomingOrigin: "local",
    }),
    false,
  );
});

test("shouldApplyReplicationChange applies when row is missing", () => {
  assert.equal(
    shouldApplyReplicationChange({
      table: "tasks",
      existingUpdatedAt: null,
      incomingUpdatedAt: new Date(),
      incomingOrigin: "cloud",
    }),
    true,
  );
});
