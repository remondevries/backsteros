import assert from "node:assert/strict";
import test from "node:test";

import {
  hrefFromLocationParts,
  listReturnHrefFromState,
  normalizeListReturnHref,
  recalledListReturnHref,
  rememberListReturnHref,
  resetListReturnHrefsForTests,
  resolveListReturnHref,
} from "./list-return-href.ts";

test.beforeEach(() => {
  resetListReturnHrefsForTests();
});

test("normalizeListReturnHref accepts filtered catalog/projects/tasks only", () => {
  assert.equal(
    normalizeListReturnHref("project", "/catalog?type=email"),
    "/catalog?type=email",
  );
  assert.equal(
    normalizeListReturnHref("project", "/projects?area=clients&view=board"),
    "/projects?area=clients&view=board",
  );
  assert.equal(
    normalizeListReturnHref("project", "/development?type=email"),
    "/catalog?type=email",
  );
  assert.equal(normalizeListReturnHref("project", "/evil"), null);
  assert.equal(
    normalizeListReturnHref("task", "/tasks?due=today&view=board"),
    "/tasks?due=today&view=board",
  );
  assert.equal(normalizeListReturnHref("task", "/catalog?type=email"), null);
});

test("resolveListReturnHref prefers state then cache then fallback", () => {
  rememberListReturnHref("task", "bod-1", "/tasks?due=week&view=list");
  assert.equal(
    resolveListReturnHref({
      kind: "task",
      locationState: { listHref: "/tasks?due=today&view=board" },
      ids: ["bod-1"],
      fallback: "/tasks",
    }),
    "/tasks?due=today&view=board",
  );
  assert.equal(
    resolveListReturnHref({
      kind: "task",
      locationState: null,
      ids: ["bod-1"],
      fallback: "/tasks",
    }),
    "/tasks?due=week&view=list",
  );
  assert.equal(
    resolveListReturnHref({
      kind: "task",
      locationState: { listHref: "/nope" },
      ids: ["missing"],
      fallback: "/tasks",
    }),
    "/tasks",
  );
  assert.equal(
    listReturnHrefFromState("task", { listHref: "/tasks?due=today" }),
    "/tasks?due=today",
  );
  assert.equal(recalledListReturnHref("task", "bod-1"), "/tasks?due=week&view=list");
  assert.equal(
    hrefFromLocationParts("/tasks", "?due=today&view=board"),
    "/tasks?due=today&view=board",
  );
});
