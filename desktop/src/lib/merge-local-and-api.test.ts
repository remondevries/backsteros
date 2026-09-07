import assert from "node:assert/strict";
import { test } from "node:test";

import {
  apiFillSourceForColdStart,
  fillMissingAgentInboxApprovedAtFromApi,
  fillMissingCodebaseFieldsFromApi,
  fillMissingDueDatesFromApi,
  fillMissingLinksFromApi,
  fillMissingLinkedCommitShasFromApi,
  fillMissingMeetingPropertiesFromApi,
  fillMissingNumberFromApi,
  fillMissingTypeFromApi,
  mergeLocalAndApiByUpdatedAt,
  dropStaleLocalHabitTasks,
  mergeLocalDocumentsWithLiveApi,
  mergeLocalWithPendingApiCreates,
  preferNewerByUpdatedAt,
  preservePendingApiRows,
  resolveLocalOrApiRows,
} from "./merge-local-and-api.ts";

test("preferNewerByUpdatedAt keeps the row with the later updatedAt", () => {
  const older = {
    id: "t1",
    dueDate: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
  };
  const newer = {
    id: "t1",
    dueDate: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-06T12:00:00.000Z",
  };
  assert.equal(preferNewerByUpdatedAt(older, newer).dueDate, newer.dueDate);
  assert.equal(preferNewerByUpdatedAt(newer, older).dueDate, newer.dueDate);
});

test("mergeLocalWithPendingApiCreates keeps optimistic API-only rows", () => {
  const merged = mergeLocalWithPendingApiCreates(
    [{ id: "existing", title: "local" }],
    [
      { id: "existing", title: "api-stale" },
      { id: "pending", title: "just-created" },
    ],
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    ["pending", "existing"],
  );
  assert.equal(merged[0]?.title, "just-created");
  assert.equal(merged[1]?.title, "local");
});

test("mergeLocalWithPendingApiCreates surfaces agent document creates until local sync", () => {
  const localDocs = [
    { id: "doc-1", type: "project", title: "Existing" },
  ];
  const apiDocs = [
    { id: "doc-1", type: "project", title: "Existing" },
    { id: "doc-agent", type: "project", title: "Agent just created" },
  ];
  const merged = mergeLocalWithPendingApiCreates(
    resolveLocalOrApiRows(localDocs, apiDocs),
    apiDocs,
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    ["doc-agent", "doc-1"],
  );
});

test("mergeLocalDocumentsWithLiveApi overlays newer API metadata (moves)", () => {
  const localDocs = [
    {
      id: "doc-1",
      parentId: "folder-a",
      title: "Note",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const apiDocs = [
    {
      id: "doc-1",
      parentId: "folder-b",
      title: "Note",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  const merged = mergeLocalDocumentsWithLiveApi(localDocs, apiDocs);
  assert.equal(merged[0]?.parentId, "folder-b");
});

test("mergeLocalDocumentsWithLiveApi keeps newer local optimistic edits", () => {
  const localDocs = [
    {
      id: "doc-1",
      title: "Local rename",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
  ];
  const apiDocs = [
    {
      id: "doc-1",
      title: "Stale API",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  const merged = mergeLocalDocumentsWithLiveApi(localDocs, apiDocs);
  assert.equal(merged[0]?.title, "Local rename");
});

test("mergeLocalDocumentsWithLiveApi hides deleted ids until PowerSync drops them", () => {
  const localDocs = [
    { id: "doc-1", title: "Gone", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "doc-2", title: "Keep", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];
  const merged = mergeLocalDocumentsWithLiveApi(localDocs, null, {
    deletedIds: new Set(["doc-1"]),
  });
  assert.deepEqual(
    merged.map((row) => row.id),
    ["doc-2"],
  );
});

test("resolveLocalOrApiRows keeps local membership but overlays newer API patches", () => {
  const resolved = resolveLocalOrApiRows(
    [
      {
        id: "1",
        updatedAt: "2026-01-01T00:00:00.000Z",
        title: "local",
        status: "triage",
      },
      {
        id: "2",
        updatedAt: "2026-01-01T00:00:00.000Z",
        title: "local-only",
        status: "backlog",
      },
    ],
    [
      {
        id: "1",
        updatedAt: "2026-01-02T00:00:00.000Z",
        title: "api",
        status: "in_progress",
      },
      {
        id: "api-only",
        updatedAt: "2026-01-02T00:00:00.000Z",
        title: "pending create",
        status: "triage",
      },
    ],
  );
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0]?.status, "in_progress");
  assert.equal(resolved[0]?.title, "api");
  assert.equal(resolved[1]?.title, "local-only");
});

test("resolveLocalOrApiRows keeps newer local over stale API hydrate", () => {
  const resolved = resolveLocalOrApiRows(
    [
      {
        id: "1",
        updatedAt: "2026-01-03T00:00:00.000Z",
        status: "completed",
      },
    ],
    [
      {
        id: "1",
        updatedAt: "2026-01-02T00:00:00.000Z",
        status: "triage",
      },
    ],
  );
  assert.equal(resolved[0]?.status, "completed");
});

test("resolveLocalOrApiRows uses API when local is empty", () => {
  const resolved = resolveLocalOrApiRows(
    [],
    [{ id: "1", updatedAt: "2026-01-02T00:00:00.000Z", title: "api" }],
  );
  assert.equal(resolved[0]?.title, "api");
});

test("apiFillSourceForColdStart is null once local has rows", () => {
  assert.equal(
    apiFillSourceForColdStart([{ id: "1" }], [{ id: "1" }]),
    null,
  );
  assert.deepEqual(apiFillSourceForColdStart([], [{ id: "1" }]), [{ id: "1" }]);
});

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

test("fillMissingAgentInboxApprovedAtFromApi copies approval when local reverted", () => {
  const filled = fillMissingAgentInboxApprovedAtFromApi(
    [{ id: "1", agentInboxApprovedAt: null }],
    [{ id: "1", agentInboxApprovedAt: "2026-08-28T10:00:00.000Z" }],
  );
  assert.equal(filled[0]?.agentInboxApprovedAt, "2026-08-28T10:00:00.000Z");
});

test("fillMissingAgentInboxApprovedAtFromApi keeps local approval when present", () => {
  const filled = fillMissingAgentInboxApprovedAtFromApi(
    [{ id: "1", agentInboxApprovedAt: "2026-08-28T09:00:00.000Z" }],
    [{ id: "1", agentInboxApprovedAt: "2026-08-28T10:00:00.000Z" }],
  );
  assert.equal(filled[0]?.agentInboxApprovedAt, "2026-08-28T09:00:00.000Z");
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

test("fillMissingLinkedCommitShasFromApi copies API shas when local is empty", () => {
  const filled = fillMissingLinkedCommitShasFromApi(
    [{ id: "1", linkedCommitShas: [], updatedAt: "2026-01-01T00:00:00.000Z" }],
    [{ id: "1", linkedCommitShas: ["abc1234deadbeef"], updatedAt: "2026-01-01T00:00:00.000Z" }],
  );
  assert.deepEqual(filled[0]?.linkedCommitShas, ["abc1234deadbeef"]);
});

test("fillMissingLinkedCommitShasFromApi keeps local shas when present", () => {
  const filled = fillMissingLinkedCommitShasFromApi(
    [{ id: "1", linkedCommitShas: ["localsha"], updatedAt: "2026-01-02T00:00:00.000Z" }],
    [{ id: "1", linkedCommitShas: ["apisha"], updatedAt: "2026-01-01T00:00:00.000Z" }],
  );
  assert.deepEqual(filled[0]?.linkedCommitShas, ["localsha"]);
});

test("fillMissingLinkedCommitShasFromApi prefers newer API empty after unlink", () => {
  const filled = fillMissingLinkedCommitShasFromApi(
    [{ id: "1", linkedCommitShas: ["abc1234deadbeef"], updatedAt: "2026-01-01T00:00:00.000Z" }],
    [{ id: "1", linkedCommitShas: [], updatedAt: "2026-01-02T00:00:00.000Z" }],
  );
  assert.deepEqual(filled[0]?.linkedCommitShas, []);
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

test("fillMissingNumberFromApi copies server number when local is null", () => {
  const filled = fillMissingNumberFromApi(
    [{ id: "1", number: null }],
    [{ id: "1", number: 53 }],
  );
  assert.equal(filled[0]?.number, 53);
});

test("fillMissingNumberFromApi replaces placeholder zero from local create", () => {
  const filled = fillMissingNumberFromApi(
    [{ id: "1", number: 0 }],
    [{ id: "1", number: 12 }],
  );
  assert.equal(filled[0]?.number, 12);
});

test("fillMissingNumberFromApi keeps local number when project scope still differs", () => {
  const filled = fillMissingNumberFromApi(
    [{ id: "1", number: 7, projectId: "inbox-scope" }],
    [{ id: "1", number: 99, projectId: "proj" }],
  );
  assert.equal(filled[0]?.number, 7);
});

test("fillMissingNumberFromApi prefers API number after same-scope renumber", () => {
  const filled = fillMissingNumberFromApi(
    [{ id: "1", number: 7, projectId: "proj" }],
    [{ id: "1", number: 99, projectId: "proj" }],
  );
  assert.equal(filled[0]?.number, 99);
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
