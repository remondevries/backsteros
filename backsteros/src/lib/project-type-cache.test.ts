import assert from "node:assert/strict";
import test from "node:test";

import {
  projectListHrefForNavFrom,
  projectListHrefFromLocationState,
  projectNavFromLocationState,
  recalledProjectListHref,
  recalledProjectNavFrom,
  rememberProjectNavFromHref,
  resolveProjectListHref,
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

test("resolveProjectListHref restores filtered catalog/projects tabs", () => {
  rememberProjectNavFromHref("/projects/RB3", {
    from: "catalog",
    listHref: "/catalog?type=email",
  });
  assert.equal(recalledProjectListHref("RB3"), "/catalog?type=email");
  assert.equal(
    projectListHrefFromLocationState({ listHref: "/catalog?type=domeinname" }),
    "/catalog?type=domeinname",
  );
  assert.equal(
    resolveProjectListHref({
      locationState: { from: "catalog", listHref: "/catalog?type=email" },
      navFrom: "catalog",
      projectKey: "OTHER",
    }),
    "/catalog?type=email",
  );
  assert.equal(
    resolveProjectListHref({
      locationState: null,
      navFrom: "catalog",
      projectKey: "RB3",
    }),
    "/catalog?type=email",
  );
  assert.equal(
    resolveProjectListHref({
      locationState: { listHref: "/evil" },
      navFrom: "projects",
      projectKey: "missing-list",
    }),
    "/projects",
  );
});
