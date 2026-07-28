import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { encodeTaskSlug } from "../dist/inbox-items.js";
import {
  extractTaskRouteParamFromHref,
  findTaskForTabHref,
  resolveProductTabTaskMeta,
  taskMatchesTabRouteParam,
} from "../dist/product-tab-task-meta.js";
import type { ProductTab } from "../dist/tabs.js";

const sampleTasks = [
  {
    id: "task-uuid-1",
    number: 12,
    status: "in_progress",
    projectId: "proj-1",
    projectKey: "BOS",
  },
  {
    id: "task-uuid-2",
    number: 3,
    status: "in_review",
    projectId: null,
    projectKey: null,
  },
] as const;

describe("extractTaskRouteParamFromHref", () => {
  test("reads scoped project and contact task slugs", () => {
    assert.equal(
      extractTaskRouteParamFromHref("/projects/bos/tasks/bos-12"),
      "bos-12",
    );
    assert.equal(
      extractTaskRouteParamFromHref("/contacts/c-1/tasks/c-3"),
      "c-3",
    );
  });

  test("reads due-filter and raw task routes", () => {
    assert.equal(
      extractTaskRouteParamFromHref("/tasks/today/bos-12"),
      "bos-12",
    );
    assert.equal(
      extractTaskRouteParamFromHref("/tasks/task-uuid-1"),
      "task-uuid-1",
    );
    assert.equal(extractTaskRouteParamFromHref("/tasks/today"), null);
  });

  test("reads inbox task slugs and skips letters", () => {
    assert.equal(extractTaskRouteParamFromHref("/inbox/bos-12"), "bos-12");
    assert.equal(extractTaskRouteParamFromHref("/inbox/ltr-4"), null);
    // `L-N` also matches parseTaskSlug, so inbox treats it as a task param
    // (letters in inbox use `ltr-N`).
    assert.equal(extractTaskRouteParamFromHref("/inbox/l-4"), "l-4");
  });
});

describe("findTaskForTabHref", () => {
  test("resolves by display slug and id", () => {
    assert.equal(
      findTaskForTabHref("/projects/bos/tasks/bos-12", sampleTasks)?.id,
      "task-uuid-1",
    );
    assert.equal(
      findTaskForTabHref("/tasks/task-uuid-2", sampleTasks)?.status,
      "in_review",
    );
  });

  test("matches inbox IN-N tasks", () => {
    assert.equal(
      findTaskForTabHref("/inbox/in-3", sampleTasks)?.id,
      "task-uuid-2",
    );
  });
});

describe("resolveProductTabTaskMeta", () => {
  test("prefers live workspace status over stored tab status", () => {
    const tab: ProductTab = {
      id: "t1",
      href: "/projects/bos/tasks/bos-12",
      title: "Ship tabs",
      taskId: "task-uuid-1",
      taskStatus: "backlog",
    };
    assert.deepEqual(resolveProductTabTaskMeta(tab, sampleTasks), {
      taskId: "task-uuid-1",
      taskStatus: "in_progress",
    });
  });

  test("falls back to stored meta when task is not in the list", () => {
    const tab: ProductTab = {
      id: "t1",
      href: "/tasks/missing",
      title: "Missing",
      taskId: "gone",
      taskStatus: "on_hold",
    };
    assert.deepEqual(resolveProductTabTaskMeta(tab, []), {
      taskId: "gone",
      taskStatus: "on_hold",
    });
  });
});

describe("taskMatchesTabRouteParam", () => {
  test("matches encodeTaskSlug forms", () => {
    assert.equal(
      taskMatchesTabRouteParam(sampleTasks[0], encodeTaskSlug("BOS", 12)),
      true,
    );
    assert.equal(taskMatchesTabRouteParam(sampleTasks[0], "other-9"), false);
  });
});
