import assert from "node:assert/strict";
import { test } from "node:test";

import { snapshotFor } from "./shell-keep-alive-snapshot.ts";

test("snapshotFor keeps letterSlug on project letter detail paths", () => {
  const snapshot = snapshotFor(
    "projects",
    "/projects/acme/letters/l-12",
    "",
  );
  assert.equal(snapshot.params.slug, "acme");
  assert.equal(snapshot.params.section, "letters");
  assert.equal(snapshot.params.letterSlug, "l-12");
});

test("snapshotFor keeps letterSlug on org-scoped project letter paths", () => {
  const snapshot = snapshotFor(
    "projects",
    "/organizations/org-1/projects/acme/letters/l-7",
    "",
  );
  assert.equal(snapshot.params.slug, "org-1");
  assert.equal(snapshot.params.projectSlug, "acme");
  assert.equal(snapshot.params.section, "letters");
  assert.equal(snapshot.params.letterSlug, "l-7");
});

test("snapshotFor keeps taskSlug on project task detail paths", () => {
  const snapshot = snapshotFor(
    "projects",
    "/projects/acme/tasks/ACME-3",
    "",
  );
  assert.equal(snapshot.params.section, "tasks");
  assert.equal(snapshot.params.taskSlug, "ACME-3");
});

test("snapshotFor keeps nested contact letter/task/meeting slugs", () => {
  const letter = snapshotFor(
    "contacts",
    "/contacts/42/letters/l-9",
    "",
  );
  assert.equal(letter.params.slug, "42");
  assert.equal(letter.params.section, "letters");
  assert.equal(letter.params.letterSlug, "l-9");

  const task = snapshotFor("contacts", "/contacts/42/tasks/INBOX-1", "");
  assert.equal(task.params.taskSlug, "INBOX-1");

  const meeting = snapshotFor(
    "contacts",
    "/contacts/42/meetings/m-3",
    "",
  );
  assert.equal(meeting.params.meetingSlug, "m-3");
});

test("snapshotFor still parses global letters slug", () => {
  const snapshot = snapshotFor("letters", "/letters/l-4", "");
  assert.equal(snapshot.params.slug, "l-4");
});
