import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allocateUniqueProjectKey,
  buildProjectKeyRenameRedirectPath,
  buildTaskProjectChangeRedirectPath,
} from "../dist/project-key.js";

test("buildProjectKeyRenameRedirectPath rewrites standalone project + task slug", () => {
  assert.equal(
    buildProjectKeyRenameRedirectPath(
      "/projects/abc/tasks/abc-12",
      "ABC",
      "XYZ",
    ),
    "/projects/xyz/tasks/xyz-12",
  );
});

test("buildProjectKeyRenameRedirectPath rewrites org-scoped project paths", () => {
  assert.equal(
    buildProjectKeyRenameRedirectPath(
      "/organizations/acme/projects/abc/tasks/abc-3",
      "ABC",
      "XYZ",
    ),
    "/organizations/acme/projects/xyz/tasks/xyz-3",
  );
});

test("buildTaskProjectChangeRedirectPath replaces the project breadcrumb path", () => {
  assert.equal(
    buildTaskProjectChangeRedirectPath("/projects/abc/tasks/abc-12", {
      taskId: "task-1",
      taskNumber: 12,
      oldProjectKey: "ABC",
      newProjectKey: "XYZ",
    }),
    "/projects/xyz/tasks/xyz-12",
  );
});

test("buildTaskProjectChangeRedirectPath retargets org scope for a new org", () => {
  assert.equal(
    buildTaskProjectChangeRedirectPath(
      "/organizations/acme/projects/abc/tasks/abc-12",
      {
        taskId: "task-1",
        taskNumber: 12,
        oldProjectKey: "ABC",
        newProjectKey: "XYZ",
        newOrganizationRouteParam: "beta",
      },
    ),
    "/organizations/beta/projects/xyz/tasks/xyz-12",
  );
});

test("buildTaskProjectChangeRedirectPath drops org scope for standalone projects", () => {
  assert.equal(
    buildTaskProjectChangeRedirectPath(
      "/organizations/acme/projects/abc/tasks/abc-12",
      {
        taskId: "task-1",
        taskNumber: 12,
        oldProjectKey: "ABC",
        newProjectKey: "XYZ",
        newOrganizationRouteParam: null,
      },
    ),
    "/projects/xyz/tasks/xyz-12",
  );
});

test("buildTaskProjectChangeRedirectPath rewrites project trail sources and task slugs", () => {
  assert.equal(
    buildTaskProjectChangeRedirectPath(
      "/projects/abc/~task/abc-12~0123456789abcdef0123456789abcdef",
      {
        taskId: "0123456789abcdef0123456789abcdef",
        taskNumber: 12,
        oldProjectKey: "ABC",
        newProjectKey: "XYZ",
      },
    ),
    "/projects/xyz/~task/xyz-12~0123456789abcdef0123456789abcdef",
  );
});

test("buildTaskProjectChangeRedirectPath rewrites due-filter task slugs", () => {
  assert.equal(
    buildTaskProjectChangeRedirectPath("/tasks/today/abc-12", {
      taskId: "task-1",
      taskNumber: 12,
      oldProjectKey: "ABC",
      newProjectKey: "XYZ",
    }),
    "/tasks/today/xyz-12",
  );
});

test("buildTaskProjectChangeRedirectPath leaves project URLs when project is cleared", () => {
  assert.equal(
    buildTaskProjectChangeRedirectPath("/projects/abc/tasks/abc-12", {
      taskId: "task-1",
      taskNumber: 12,
      oldProjectKey: "ABC",
      newProjectKey: null,
    }),
    "/tasks/task-1",
  );
});

test("buildTaskProjectChangeRedirectPath is a no-op for unrelated paths", () => {
  assert.equal(
    buildTaskProjectChangeRedirectPath("/inbox/abc-12", {
      taskId: "task-1",
      taskNumber: 12,
      oldProjectKey: "ABC",
      newProjectKey: "XYZ",
    }),
    "/inbox/abc-12",
  );
});

test("buildTaskProjectChangeRedirectPath can use the durable task id leaf", () => {
  assert.equal(
    buildTaskProjectChangeRedirectPath("/projects/abc/tasks/abc-12", {
      taskId: "task-1",
      taskNumber: 12,
      oldProjectKey: "ABC",
      newProjectKey: "XYZ",
      routeLeaf: "task-id",
    }),
    "/projects/xyz/tasks/task-1",
  );
});

test("allocateUniqueProjectKey returns preferred when free", () => {
  assert.equal(allocateUniqueProjectKey("bod", ["XYZ"]), "BOD");
});

test("allocateUniqueProjectKey finds a nearby free key", () => {
  assert.equal(
    allocateUniqueProjectKey("BOD", ["BOD", "BO2", "BO3"]),
    "BO4",
  );
});
