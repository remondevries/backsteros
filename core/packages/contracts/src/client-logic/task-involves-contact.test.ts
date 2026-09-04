import assert from "node:assert/strict";
import { test } from "node:test";

import { taskInvolvesContact } from "./task-involves-contact.js";

test("taskInvolvesContact matches assignee", () => {
  assert.equal(
    taskInvolvesContact({ assigneeId: "c1", contactId: null }, "c1"),
    true,
  );
});

test("taskInvolvesContact matches structural contactId", () => {
  assert.equal(
    taskInvolvesContact({ assigneeId: null, contactId: "c1" }, "c1"),
    true,
  );
});

test("taskInvolvesContact matches relatedContactIds", () => {
  assert.equal(
    taskInvolvesContact(
      {
        assigneeId: "other",
        contactId: null,
        relatedContactIds: ["a", "c1"],
      },
      "c1",
    ),
    true,
  );
});

test("taskInvolvesContact does not match unrelated contacts", () => {
  assert.equal(
    taskInvolvesContact(
      {
        assigneeId: "a",
        contactId: "b",
        relatedContactIds: ["c"],
      },
      "z",
    ),
    false,
  );
});

test("taskInvolvesContact treats missing related as empty", () => {
  assert.equal(
    taskInvolvesContact({ assigneeId: null, contactId: null }, "c1"),
    false,
  );
});
