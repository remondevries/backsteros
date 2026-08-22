import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fillMissingCodebaseFieldsFromApi,
  fillMissingDueDatesFromApi,
  fillMissingLinksFromApi,
  fillMissingMeetingPropertiesFromApi,
  fillMissingTypeFromApi,
  mergeLocalAndApiByUpdatedAt,
  dropStaleLocalHabitTasks,
  preservePendingApiRows,
} from "./merge-local-and-api.ts";

test("dropStaleLocalHabitTasks removes local-only habit day copies", () => {
  const dropped = dropStaleLocalHabitTasks(
    [
      { id: "keep", habitId: "h1" },
      { id: "stale", habitId: "h1" },
      { id: "normal", habitId: null },
    ],
    [{ id: "keep", habitId: "h1" }],
  );
  assert.deepEqual(
    dropped.map((row) => row.id),
    ["keep", "normal"],
  );
});

test("mergeLocalAndApiByUpdatedAt prefers newer API row", () => {
  const merged = mergeLocalAndApiByUpdatedAt(
    [{ id: "1", updatedAt: "2026-01-01T00:00:00.000Z", title: "local" }],
    [{ id: "1", updatedAt: "2026-01-02T00:00:00.000Z", title: "api" }],
  );
  assert.equal(merged[0]?.title, "api");
});

test("fillMissingDueDatesFromApi copies scheduling when local omitted due date", () => {
  const filled = fillMissingDueDatesFromApi(
    [
      {
        id: "1",
        dueDate: null,
        dueEndDate: null,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      {
        id: "1",
        dueDate: "2026-08-24T09:00:00.000Z",
        dueEndDate: "2026-08-24T10:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  );
  assert.equal(filled[0]?.dueDate, "2026-08-24T09:00:00.000Z");
  assert.equal(filled[0]?.dueEndDate, "2026-08-24T10:00:00.000Z");
});

test("fillMissingLinksFromApi copies API links when local is empty", () => {
  const filled = fillMissingLinksFromApi(
    [
      {
        id: "1",
        links: [],
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      {
        id: "1",
        links: [{ id: "l1", url: "https://example.com", createdAt: "2026-01-01" }],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  );
  assert.equal(filled[0]?.links?.length, 1);
  assert.equal(
    (filled[0]?.links as Array<{ url: string }>)[0]?.url,
    "https://example.com",
  );
});

test("fillMissingLinksFromApi keeps local links when present", () => {
  const filled = fillMissingLinksFromApi(
    [
      {
        id: "1",
        links: [{ id: "l1", url: "https://local.test", createdAt: "2026-01-02" }],
      },
    ],
    [
      {
        id: "1",
        links: [{ id: "l2", url: "https://api.test", createdAt: "2026-01-01" }],
      },
    ],
  );
  assert.equal(
    (filled[0]?.links as Array<{ url: string }>)[0]?.url,
    "https://local.test",
  );
});

test("fillMissingTypeFromApi copies API type when local is empty", () => {
  const filled = fillMissingTypeFromApi(
    [{ id: "1", type: null, updatedAt: "2026-01-02T00:00:00.000Z" }],
    [{ id: "1", type: "codebase", updatedAt: "2026-01-01T00:00:00.000Z" }],
  );
  assert.equal(filled[0]?.type, "codebase");
});

test("fillMissingTypeFromApi keeps local type when present", () => {
  const filled = fillMissingTypeFromApi(
    [{ id: "1", type: "webhosting" }],
    [{ id: "1", type: "codebase" }],
  );
  assert.equal(filled[0]?.type, "webhosting");
});

test("fillMissingCodebaseFieldsFromApi copies repo and cwd when local is empty", () => {
  const filled = fillMissingCodebaseFieldsFromApi(
    [
      {
        id: "1",
        githubRepository: null,
        localWorkingDirectory: "",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      {
        id: "1",
        githubRepository: "acme/app",
        localWorkingDirectory: "/Users/me/code/app",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  );
  assert.equal(filled[0]?.githubRepository, "acme/app");
  assert.equal(filled[0]?.localWorkingDirectory, "/Users/me/code/app");
});

test("fillMissingCodebaseFieldsFromApi keeps local repo and cwd when present", () => {
  const filled = fillMissingCodebaseFieldsFromApi(
    [
      {
        id: "1",
        githubRepository: "local/repo",
        localWorkingDirectory: "/tmp/local",
      },
    ],
    [
      {
        id: "1",
        githubRepository: "api/repo",
        localWorkingDirectory: "/tmp/api",
      },
    ],
  );
  assert.equal(filled[0]?.githubRepository, "local/repo");
  assert.equal(filled[0]?.localWorkingDirectory, "/tmp/local");
});

test("fillMissingMeetingPropertiesFromApi copies project when local omitted", () => {
  const filled = fillMissingMeetingPropertiesFromApi(
    [
      {
        id: "1",
        projectId: null,
        organizationId: null,
        attendeeContactIds: [],
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      {
        id: "1",
        projectId: "proj-1",
        organizationId: "org-1",
        attendeeContactIds: ["contact-1"],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  );
  assert.equal(filled[0]?.projectId, "proj-1");
  assert.equal(filled[0]?.organizationId, "org-1");
  assert.deepEqual(filled[0]?.attendeeContactIds, ["contact-1"]);
});

test("preservePendingApiRows keeps optimistic creates missing from hydrate", () => {
  const merged = preservePendingApiRows(
    [
      { id: "new", title: "Just created" },
      { id: "old", title: "Already synced" },
    ],
    [{ id: "old", title: "Already synced" }],
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    ["new", "old"],
  );
});
