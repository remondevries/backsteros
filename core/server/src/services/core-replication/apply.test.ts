import assert from "node:assert/strict";
import test from "node:test";

import {
  documentContentMetaFromRow,
  isCalendarBusyTaskRow,
  preferIncomingOnConflict,
  shouldApplyByUpdatedAt,
  shouldApplyDocumentRow,
} from "./rules.js";
import { CALENDAR_BUSY_TASK_LEGACY_SOURCE } from "./constants.js";

test("shouldApplyByUpdatedAt uses updated_at ordering", () => {
  const at = new Date("2026-08-24T10:00:00Z");
  const later = new Date("2026-08-24T11:00:00Z");
  assert.equal(
    shouldApplyByUpdatedAt("meetings", "local", later, at),
    "apply",
  );
  assert.equal(
    shouldApplyByUpdatedAt("meetings", "cloud", at, later),
    "skip",
  );
});

test("shouldApplyByUpdatedAt tie-breakers favor local settings and cloud meetings", () => {
  const at = new Date("2026-08-24T10:00:00Z");
  assert.equal(
    shouldApplyByUpdatedAt("meeting_scheduling_settings", "cloud", at, at),
    "apply",
  );
  assert.equal(
    shouldApplyByUpdatedAt("meeting_scheduling_settings", "local", at, at),
    "skip",
  );
  assert.equal(shouldApplyByUpdatedAt("meetings", "local", at, at), "apply");
  assert.equal(shouldApplyByUpdatedAt("meetings", "cloud", at, at), "skip");
  assert.equal(preferIncomingOnConflict("meetings", "local"), true);
});

test("shouldApplyByUpdatedAt applies when row is missing", () => {
  assert.equal(
    shouldApplyByUpdatedAt("tasks", "cloud", new Date(), null),
    "apply",
  );
});

test("shouldApplyDocumentRow refuses empty remote over non-empty local", () => {
  const older = new Date("2026-08-24T10:00:00Z");
  const newer = new Date("2026-08-24T12:00:00Z");
  assert.equal(
    shouldApplyDocumentRow(
      "local",
      newer,
      older,
      { byteSize: 0, contentVersion: 21 },
      { byteSize: 1200, contentVersion: 20 },
    ),
    "skip",
  );
});

test("shouldApplyDocumentRow prefers non-empty remote over empty local", () => {
  const older = new Date("2026-08-24T10:00:00Z");
  const newer = new Date("2026-08-24T09:00:00Z");
  assert.equal(
    shouldApplyDocumentRow(
      "local",
      newer,
      older,
      { byteSize: 500, contentVersion: 5 },
      { byteSize: 0, contentVersion: 21 },
    ),
    "apply",
  );
});

test("shouldApplyDocumentRow prefers higher content_version on equal timestamps", () => {
  const at = new Date("2026-08-24T10:00:00Z");
  assert.equal(
    shouldApplyDocumentRow(
      "local",
      at,
      at,
      { byteSize: 10, contentVersion: 8 },
      { byteSize: 10, contentVersion: 7 },
    ),
    "apply",
  );
  assert.equal(
    shouldApplyDocumentRow(
      "local",
      at,
      at,
      { byteSize: 10, contentVersion: 6 },
      { byteSize: 10, contentVersion: 7 },
    ),
    "skip",
  );
});

test("documentContentMetaFromRow reads snake_case columns", () => {
  assert.deepEqual(
    documentContentMetaFromRow({ byte_size: 42, content_version: 3 }),
    { byteSize: 42, contentVersion: 3 },
  );
});

test("legacy busy helper still works", () => {
  assert.equal(
    isCalendarBusyTaskRow({ legacy_source: CALENDAR_BUSY_TASK_LEGACY_SOURCE }),
    true,
  );
  assert.equal(isCalendarBusyTaskRow({ legacy_source: "circle" }), false);
});
