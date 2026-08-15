import assert from "node:assert/strict";
import { test } from "node:test";

import {
  rememberProjectNavFrom,
  resolveProjectNavFromForPath,
  resolveSidebarActivePathname,
} from "./project-type-cache.ts";

test("resolveSidebarActivePathname keeps Projects when from projects or unset", () => {
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD", "projects"),
    "/projects/BOD",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD/files", null),
    "/projects/BOD/files",
  );
});

test("resolveSidebarActivePathname remaps Development and Areas project routes", () => {
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD", "development"),
    "/development",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD/tasks/bod-1", "development"),
    "/development",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects/BOD/files", "areas"),
    "/areas",
  );
});

test("resolveSidebarActivePathname leaves list roots and non-project paths alone", () => {
  assert.equal(
    resolveSidebarActivePathname("/projects", "development"),
    "/projects",
  );
  assert.equal(
    resolveSidebarActivePathname("/projects/new", "development"),
    "/projects/new",
  );
  assert.equal(
    resolveSidebarActivePathname("/development", "development"),
    "/development",
  );
  assert.equal(
    resolveSidebarActivePathname("/organizations/acme/projects/BOD", "development"),
    "/organizations/acme/projects/BOD",
  );
});

test("resolveProjectNavFromForPath prefers location state then cache", () => {
  rememberProjectNavFrom("id-nav-1", "NAV1", "areas");
  assert.equal(
    resolveProjectNavFromForPath({
      locationState: { from: "development" },
      projectId: "id-nav-1",
      projectKey: "NAV1",
      routeParam: "NAV1",
    }),
    "development",
  );
  assert.equal(
    resolveProjectNavFromForPath({
      locationState: null,
      projectId: "id-nav-1",
      projectKey: "NAV1",
      routeParam: "NAV1",
    }),
    "areas",
  );
});
