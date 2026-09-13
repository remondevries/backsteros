import assert from "node:assert/strict";
import test from "node:test";

import {
  projectListHrefForNavFrom,
  projectNavFromLocationState,
  recalledProjectNavFrom,
  rememberProjectNavFromHref,
  resolveProjectNavFromForPath,
  resolveSidebarActivePathname,
} from "./project-type-cache.ts";

test("resolveSidebarActivePathname remaps project paths when from catalog", () => {
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD", "catalog"),
    "/catalog",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD/tasks/bod-1", "catalog"),
    "/catalog",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD", "projects"),
    "/projects/BOD",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD", null),
    "/projects/BOD",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects", "catalog"),
    "/projects",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects/new", "catalog"),
    "/projects/new",
  );
  assert.equal(
    resolveSidebarActivePathname("/catalog", "catalog"),
    "/catalog",
  );
  assert.equal(
    resolveSidebarActivePathname("/organizations/acme/projects/BOD", "catalog"),
    "/organizations/acme/projects/BOD",
  );
});

test("resolveProjectNavFromForPath prefers location state then cache", () => {
  assert.equal(
    resolveProjectNavFromForPath({
      locationState: { from: "catalog" },
      projectKey: "BOD",
    }),
    "catalog",
  );
  assert.equal(
    resolveProjectNavFromForPath({
      locationState: { from: "development" },
      projectKey: "BOD",
    }),
    "catalog",
  );
  assert.equal(
    resolveProjectNavFromForPath({
      locationState: null,
      projectKey: "missing",
    }),
    null,
  );
});

test("rememberProjectNavFromHref caches from navigate state", () => {
  rememberProjectNavFromHref("/projects/BOD/tasks/1", {
    from: "catalog",
  });
  assert.equal(recalledProjectNavFrom("BOD"), "catalog");
  assert.equal(
    projectNavFromLocationState({ from: "catalog" }),
    "catalog",
  );
  assert.equal(projectListHrefForNavFrom("catalog"), "/catalog");
});
