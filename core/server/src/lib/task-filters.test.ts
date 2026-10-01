import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TASK_LIST_CURSOR_TTL_MS,
  TASK_LIST_DEFAULT_LIMIT,
  TASK_LIST_MAX_LIMIT,
  TaskFilterError,
  decodeTaskListCursor,
  encodeTaskListCursor,
  formatTaskDisplayKey,
  ignoredLegacyTaskListKeys,
  parseDueDateFilter,
  parseTaskListLimit,
  parseTaskListQuery,
  parseTaskMultiValues,
  shouldUsePaginatedTaskList,
  taskRowMatchesScalarFilters,
} from "./task-filters.ts";

describe("task filter parsing", () => {
  it("parses single and multi-value OR lists", () => {
    assert.deepEqual(parseTaskMultiValues("a"), ["a"]);
    assert.deepEqual(parseTaskMultiValues("ready_to_start,in_progress"), [
      "ready_to_start",
      "in_progress",
    ]);
    assert.deepEqual(parseTaskMultiValues(["a", "b,c"]), ["a", "b", "c"]);
  });

  it("parses dueDate before/after/between", () => {
    const before = parseDueDateFilter("before:2025-06-01");
    assert.equal(before?.op, "before");
    if (before?.op === "before") {
      assert.equal(before.date.toISOString(), "2025-06-01T00:00:00.000Z");
    }

    const after = parseDueDateFilter("after:2025-01-01T12:00:00.000Z");
    assert.equal(after?.op, "after");

    const between = parseDueDateFilter(
      "between:2025-01-01,2025-12-31T23:59:59.000Z",
    );
    assert.equal(between?.op, "between");
    if (between?.op === "between") {
      assert.ok(between.start.getTime() < between.end.getTime());
    }
  });

  it("rejects bad dueDate and unknown fields in paginated mode", () => {
    assert.throws(
      () => parseDueDateFilter("2025-01-01"),
      (err: unknown) =>
        err instanceof TaskFilterError && err.field === "dueDate",
    );
    // Legacy ignores unknown keys (backward compatible).
    assert.equal(parseTaskListQuery({ foo: "bar" }).mode, "legacy");
    assert.throws(
      () => parseTaskListQuery({ foo: "bar", paginated: "true" }),
      (err: unknown) =>
        err instanceof TaskFilterError && err.field === "foo",
    );
    assert.throws(
      () => parseTaskListQuery({ status: "not_a_status", paginated: "true" }),
      (err: unknown) =>
        err instanceof TaskFilterError && err.field === "status",
    );
  });

  it("clamps limit and defaults page size", () => {
    assert.equal(parseTaskListLimit(undefined), TASK_LIST_DEFAULT_LIMIT);
    assert.equal(parseTaskListLimit("10"), 10);
    assert.throws(
      () => parseTaskListLimit("0"),
      (err: unknown) => err instanceof TaskFilterError && err.field === "limit",
    );
    assert.throws(
      () => parseTaskListLimit(String(TASK_LIST_MAX_LIMIT + 1)),
      (err: unknown) => err instanceof TaskFilterError && err.field === "limit",
    );
  });

  it("uses paginated mode only on explicit opt-in (OS-45)", () => {
    assert.equal(parseTaskListQuery({ projectId: "p1" }).mode, "legacy");
    // Bare limit (and other paginated-only params) keep the legacy shape.
    assert.equal(
      parseTaskListQuery({ projectId: "p1", limit: "30" }).mode,
      "legacy",
    );
    assert.equal(parseTaskListQuery({ projectId: "p1,p2" }).mode, "legacy");
    assert.equal(parseTaskListQuery({ sort: "dueDate" }).mode, "legacy");
    assert.equal(
      parseTaskListQuery({ dueDate: "before:2026-01-01" }).mode,
      "legacy",
    );
    assert.equal(parseTaskListQuery({ linkedDocuments: "doc1" }).mode, "legacy");
    // Legacy ignores bad limits instead of 400ing (limit is ignored).
    assert.equal(parseTaskListQuery({ limit: "500" }).mode, "legacy");
    assert.equal(parseTaskListQuery({ paginated: "true" }).mode, "paginated");
    assert.equal(parseTaskListQuery({ paginated: "1" }).mode, "paginated");
    assert.equal(parseTaskListQuery({ paginated: "false" }).mode, "legacy");
    assert.equal(
      shouldUsePaginatedTaskList({ cursor: "abc", paginatedFlag: false }),
      true,
    );
    assert.equal(
      shouldUsePaginatedTaskList({ cursor: "  ", paginatedFlag: false }),
      false,
    );
    // Multi-value lists still parse in legacy mode (route applies them as OR).
    assert.deepEqual(
      parseTaskListQuery({ status: "in_progress,on_hold" }).statuses,
      ["in_progress", "on_hold"],
    );
  });

  it("reports paginated-only params ignored in legacy mode", () => {
    assert.deepEqual(
      ignoredLegacyTaskListKeys({ projectId: "p1", limit: "30", sort: "" }),
      ["limit"],
    );
    assert.deepEqual(ignoredLegacyTaskListKeys({ projectId: "p1" }), []);
    assert.deepEqual(
      ignoredLegacyTaskListKeys({ updatedSince: "2026-01-01", dueDate: "x" }),
      ["dueDate", "updatedSince"],
    );
  });

  it("parses updatedSince in paginated mode (OS-45)", () => {
    const parsed = parseTaskListQuery({
      paginated: "true",
      updatedSince: "2026-10-01T10:00:00Z",
    });
    assert.equal(parsed.updatedSince?.toISOString(), "2026-10-01T10:00:00.000Z");
    assert.equal(
      parseTaskListQuery({ paginated: "true", updatedSince: "2026-10-01" })
        .updatedSince?.toISOString(),
      "2026-10-01T00:00:00.000Z",
    );
    assert.throws(
      () => parseTaskListQuery({ paginated: "true", updatedSince: "nope" }),
      (err: unknown) =>
        err instanceof TaskFilterError && err.field === "updatedSince",
    );
    assert.equal(
      parseTaskListQuery({ updatedSince: "2026-10-01" }).updatedSince,
      undefined,
    );
    // Statuses used by the bulk open-tasks call are all valid.
    assert.deepEqual(
      parseTaskListQuery({
        paginated: "true",
        status: "triage,backlog,ready_to_start,in_progress,on_hold,in_review",
      }).statuses.length,
      6,
    );
  });

  it("applies AND across fields and OR within a field", () => {
    const filters = parseTaskListQuery({
      status: "ready_to_start,in_progress",
      projectId: "proj-a",
      paginated: "true",
    });
    assert.equal(
      taskRowMatchesScalarFilters(
        {
          projectId: "proj-a",
          status: "ready_to_start",
          assigneeId: null,
          contactId: null,
          relatedContactIds: [],
          dueDate: null,
        },
        filters,
      ),
      true,
    );
    assert.equal(
      taskRowMatchesScalarFilters(
        {
          projectId: "proj-a",
          status: "completed",
          assigneeId: null,
          contactId: null,
          relatedContactIds: [],
          dueDate: null,
        },
        filters,
      ),
      false,
    );
    assert.equal(
      taskRowMatchesScalarFilters(
        {
          projectId: "other",
          status: "in_progress",
          assigneeId: null,
          contactId: null,
          relatedContactIds: [],
          dueDate: null,
        },
        filters,
      ),
      false,
    );
  });

  it("excludes completed/canceled/duplicated by default in scalar matcher", () => {
    const filters = parseTaskListQuery({ paginated: "true" });
    assert.equal(
      taskRowMatchesScalarFilters(
        {
          projectId: "p",
          status: "duplicated",
          assigneeId: null,
          contactId: null,
          relatedContactIds: [],
          dueDate: null,
        },
        filters,
      ),
      false,
    );
    assert.equal(
      taskRowMatchesScalarFilters(
        {
          projectId: "p",
          status: "completed",
          assigneeId: null,
          contactId: null,
          relatedContactIds: [],
          dueDate: null,
        },
        filters,
      ),
      false,
    );
    const withCompleted = parseTaskListQuery({
      status: "completed",
      paginated: "true",
    });
    assert.equal(
      taskRowMatchesScalarFilters(
        {
          projectId: "p",
          status: "completed",
          assigneeId: null,
          contactId: null,
          relatedContactIds: [],
          dueDate: null,
        },
        withCompleted,
      ),
      true,
    );
  });
});

describe("task list cursor", () => {
  it("round-trips encode/decode", () => {
    const now = 1_700_000_000_000;
    const encoded = encodeTaskListCursor(
      {
        dueDate: new Date("2025-05-01T00:00:00.000Z"),
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        id: "task-1",
      },
      now,
    );
    const decoded = decodeTaskListCursor(encoded, now + 1000);
    assert.equal(decoded.id, "task-1");
    assert.equal(decoded.nullDue, 0);
    assert.equal(decoded.dueDate, "2025-05-01T00:00:00.000Z");
  });

  it("rejects expired cursors", () => {
    const now = 1_700_000_000_000;
    const encoded = encodeTaskListCursor(
      {
        dueDate: null,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        id: "task-1",
      },
      now,
    );
    assert.throws(
      () => decodeTaskListCursor(encoded, now + TASK_LIST_CURSOR_TTL_MS + 1),
      (err: unknown) =>
        err instanceof TaskFilterError &&
        err.code === "cursor_expired" &&
        err.field === "cursor",
    );
  });

  it("rejects malformed cursors", () => {
    assert.throws(
      () => decodeTaskListCursor("not-a-cursor"),
      (err: unknown) =>
        err instanceof TaskFilterError && err.field === "cursor",
    );
  });
});

describe("task display key", () => {
  it("formats project and inbox keys", () => {
    assert.equal(formatTaskDisplayKey("OS", 28), "OS-28");
    assert.equal(formatTaskDisplayKey(null, 3), "INBOX-3");
  });
});
