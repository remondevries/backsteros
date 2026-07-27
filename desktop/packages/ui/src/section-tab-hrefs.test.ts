import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDesktopSectionTabHrefs } from "../dist/section-tab-hrefs.js";

test("project overview uses default section tabs when workbench is not mounted", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo"), [
    "/projects/demo",
    "/projects/demo/tasks",
    "/projects/demo/documents",
    "/projects/demo/letters",
    "/projects/demo/updates",
  ]);
});

test("codebase workbench routes use Tasks/Files/Commits/PRs tabs", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/files"), [
    "/projects/demo",
    "/projects/demo/files",
    "/projects/demo/commits",
    "/projects/demo/pulls",
  ]);
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/commits/abc"), [
    "/projects/demo",
    "/projects/demo/files",
    "/projects/demo/commits",
    "/projects/demo/pulls",
  ]);
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/pulls/12"), [
    "/projects/demo",
    "/projects/demo/files",
    "/projects/demo/commits",
    "/projects/demo/pulls",
  ]);
});

test("standard project sections stay on default tabs", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/documents"), [
    "/projects/demo",
    "/projects/demo/tasks",
    "/projects/demo/documents",
    "/projects/demo/letters",
    "/projects/demo/updates",
  ]);
});

test("org-scoped codebase workbench routes use scoped tab hrefs", () => {
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/organizations/acme/projects/demo/files"),
    [
      "/organizations/acme/projects/demo",
      "/organizations/acme/projects/demo/files",
      "/organizations/acme/projects/demo/commits",
      "/organizations/acme/projects/demo/pulls",
    ],
  );
});

test("mounted codebase workbench maps bare project path to list tabs", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) =>
      selector === "[data-codebase-workbench]" ? {} : null,
  } as unknown as Document;

  try {
    assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo"), [
      "/projects/demo",
      "/projects/demo/files",
      "/projects/demo/commits",
      "/projects/demo/pulls",
    ]);
  } finally {
    globalThis.document = previousDocument;
  }
});
