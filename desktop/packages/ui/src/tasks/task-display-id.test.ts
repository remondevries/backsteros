import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coerceTaskDisplayNumber,
  getTaskDisplayId,
} from "./task-display-id.ts";

test("coerceTaskDisplayNumber rejects null zero and non-numeric", () => {
  assert.equal(coerceTaskDisplayNumber(null), null);
  assert.equal(coerceTaskDisplayNumber(0), null);
  assert.equal(coerceTaskDisplayNumber(""), null);
  assert.equal(coerceTaskDisplayNumber("nope"), null);
  assert.equal(coerceTaskDisplayNumber(3), 3);
  assert.equal(coerceTaskDisplayNumber("12"), 12);
});

test("getTaskDisplayId formats inbox ids without a project", () => {
  assert.equal(
    getTaskDisplayId({ number: 4, projectId: null }),
    "IN-4",
  );
});

test("getTaskDisplayId formats project ids from context key", () => {
  assert.equal(
    getTaskDisplayId({ number: 3, projectId: "p1" }, "MD"),
    "MD-3",
  );
});

test("getTaskDisplayId formats project ids from task.projectKey", () => {
  assert.equal(
    getTaskDisplayId({
      number: 3,
      projectId: "p1",
      projectKey: "MD",
    }),
    "MD-3",
  );
});

test("getTaskDisplayId hides id when project is set but key is missing", () => {
  assert.equal(
    getTaskDisplayId({ number: 3, projectId: "p1" }),
    null,
  );
});

test("getTaskDisplayId hides id when number is missing", () => {
  assert.equal(
    getTaskDisplayId({ number: null, projectKey: "MD" }, "MD"),
    null,
  );
});
