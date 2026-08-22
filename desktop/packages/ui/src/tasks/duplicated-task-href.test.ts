import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDuplicatedTaskHref } from "../../dist/tasks/duplicated-task-href.js";

test("project tasks use scoped project href", () => {
  assert.equal(
    resolveDuplicatedTaskHref({
      id: "t1",
      number: 12,
      projectKey: "BOD",
    }),
    "/projects/BOD/tasks/bod-12",
  );
});

test("contact tasks use contact-scoped href", () => {
  assert.equal(
    resolveDuplicatedTaskHref({
      id: "t2",
      number: 3,
      contactKey: "alice",
    }),
    "/contacts/alice/tasks/alice-3",
  );
});

test("inbox tasks use inbox slug href", () => {
  assert.equal(
    resolveDuplicatedTaskHref({
      id: "t3",
      number: 9,
    }),
    "/inbox/in-9",
  );
});

test("falls back to durable id when number is missing", () => {
  assert.equal(
    resolveDuplicatedTaskHref({
      id: "t4",
      number: null,
      projectKey: "BOD",
    }),
    "/tasks/t4",
  );
});
