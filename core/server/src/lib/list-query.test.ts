import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCUMENTS_DEFAULT_LIMIT,
  LIST_DEFAULT_LIMIT,
  ListQueryError,
  assertDocumentListTypeValue,
  decodeUpdatedAtCursor,
  encodeUpdatedAtCursor,
  parseContactsListQuery,
  parseDocumentsListLimit,
  parseDueTasksListQuery,
  parseGlobalSearchQuery,
  parseMeetingsListQuery,
  parseProjectsListQuery,
  parseSearchQuery,
  paginateByUpdatedAtId,
} from "./list-query.js";

test("parseMeetingsListQuery: filters, enums, unknown keys", () => {
  const parsed = parseMeetingsListQuery({
    projectId: "OS",
    status: "in_progress,ready_to_start",
    from: "2026-01-01",
    paginated: "true",
    limit: "10",
  });
  assert.equal(parsed.mode, "paginated");
  assert.equal(parsed.projectId, "OS");
  assert.deepEqual(parsed.statuses, ["in_progress", "ready_to_start"]);
  assert.equal(parsed.limit, 10);
  assert.ok(parsed.from);

  assert.throws(
    () => parseMeetingsListQuery({ status: "bogus" }),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "status",
  );
  assert.throws(
    () => parseMeetingsListQuery({ foo: "1" }),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "foo",
  );
});

test("parseProjectsListQuery: bad status/type → 400 field", () => {
  assert.throws(
    () => parseProjectsListQuery({ status: "bogus" }),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "status",
  );
  assert.throws(
    () => parseProjectsListQuery({ type: "bogus" }),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "type",
  );
  const ok = parseProjectsListQuery({ status: "active", type: "codebase" });
  assert.equal(ok.status, "active");
  assert.equal(ok.type, "codebase");
  assert.equal(ok.mode, "legacy");
  assert.equal(ok.limit, LIST_DEFAULT_LIMIT);
});

test("parseContactsListQuery: paginated opt-in", () => {
  assert.equal(parseContactsListQuery({}).mode, "legacy");
  assert.equal(
    parseContactsListQuery({ paginated: "true", limit: "5" }).mode,
    "paginated",
  );
  assert.equal(
    parseContactsListQuery({ paginated: "true", limit: "5" }).limit,
    5,
  );
});

test("parseDocumentsListLimit: default 100", () => {
  assert.deepEqual(parseDocumentsListLimit(undefined), {
    limit: DOCUMENTS_DEFAULT_LIMIT,
    appliedDefault: true,
  });
  assert.deepEqual(parseDocumentsListLimit("25"), {
    limit: 25,
    appliedDefault: false,
  });
  assert.throws(
    () => parseDocumentsListLimit("0"),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "limit",
  );
});

test("assertDocumentListTypeValue rejects bogus", () => {
  assert.doesNotThrow(() => assertDocumentListTypeValue("knowledge"));
  assert.doesNotThrow(() => assertDocumentListTypeValue("house-rule"));
  assert.throws(
    () => assertDocumentListTypeValue("bogus"),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "type",
  );
});

test("parseGlobalSearchQuery: mode + limit clamp hint", () => {
  assert.throws(
    () => parseGlobalSearchQuery({ q: "x", mode: "bogus" }),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "mode",
  );
  const clamped = parseGlobalSearchQuery({ q: "backster", limit: "1000" });
  assert.equal(clamped.limit, 100);
  assert.equal(clamped.limitClamped, true);
  assert.equal(clamped.mode, "all");
});

test("parseDueTasksListQuery: limit without paginated still applies", () => {
  const parsed = parseDueTasksListQuery({ limit: "3" });
  assert.equal(parsed.mode, "legacy");
  assert.equal(parsed.limit, 3);
  const page = parseDueTasksListQuery({ paginated: "true" });
  assert.equal(page.mode, "paginated");
  assert.equal(page.limit, LIST_DEFAULT_LIMIT);
});

test("updatedAt cursor round-trip and pagination", () => {
  const now = Date.now();
  const cursor = encodeUpdatedAtCursor(
    { id: "b", updatedAt: "2026-01-02T00:00:00.000Z" },
    now,
  );
  const decoded = decodeUpdatedAtCursor(cursor, now);
  assert.equal(decoded.id, "b");
  assert.equal(decoded.updatedAt, "2026-01-02T00:00:00.000Z");

  const rows = [
    { id: "a", updatedAt: "2026-01-03T00:00:00.000Z" },
    { id: "b", updatedAt: "2026-01-02T00:00:00.000Z" },
    { id: "c", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];
  const page1 = paginateByUpdatedAtId(rows, { limit: 2, nowMs: now });
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);
  const page2 = paginateByUpdatedAtId(rows, {
    limit: 2,
    cursor: page1.nextCursor!,
    nowMs: now,
  });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.items[0]!.id, "c");
  assert.equal(page2.nextCursor, null);
});

test("parseSearchQuery: type=task alias, invalid type → field type", () => {
  const task = parseSearchQuery({ q: "FiboSearch", type: "task", limit: "5" });
  assert.equal(task.type, "task");
  assert.equal(task.limit, 5);
  assert.equal(task.q, "FiboSearch");

  const alias = parseSearchQuery({ q: "x", type: "tasks" });
  assert.equal(alias.type, "task");
  assert.equal(alias.limit, 20);

  const knowledge = parseSearchQuery({ q: "Daily Briefing", type: "knowledge" });
  assert.equal(knowledge.type, "knowledge");

  assert.throws(
    () => parseSearchQuery({ q: "x", type: "bogus" }),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "type",
  );
  assert.throws(
    () => parseSearchQuery({ q: "x", type: "document" }),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "type",
  );
  assert.throws(
    () => parseSearchQuery({}),
    (error: unknown) => error instanceof ListQueryError && error.field === "q",
  );
  assert.throws(
    () => parseSearchQuery({ q: "x", status: "bogus", type: "task" }),
    (error: unknown) =>
      error instanceof ListQueryError && error.field === "status",
  );
});
