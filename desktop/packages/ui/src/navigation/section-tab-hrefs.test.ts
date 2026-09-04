import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findActiveSectionTabIndex,
  resolveAdjacentSectionTabHref,
  resolveDesktopSectionTabHrefs,
  resolveSectionTabCycleShortcut,
} from "../../dist/navigation/section-tab-hrefs.js";

test("project overview uses default section tabs when workbench is not mounted", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo"), [
    "/projects/demo",
    "/projects/demo/tasks",
    "/projects/demo/documents",
    "/projects/demo/letters",
    "/projects/demo/updates",
  ]);
});

test("codebase workbench routes use Tasks/Files/Docs/Commits/PRs tabs", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/files"), [
    "/projects/demo",
    "/projects/demo/files",
    "/projects/demo/documents",
    "/projects/demo/commits",
    "/projects/demo/pulls",
  ]);
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/commits/abc"), [
    "/projects/demo",
    "/projects/demo/files",
    "/projects/demo/documents",
    "/projects/demo/commits",
    "/projects/demo/pulls",
  ]);
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/pulls/12"), [
    "/projects/demo",
    "/projects/demo/files",
    "/projects/demo/documents",
    "/projects/demo/commits",
    "/projects/demo/pulls",
  ]);
});

test("standard project documents stay on default tabs when workbench is not mounted", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/documents"), [
    "/projects/demo",
    "/projects/demo/tasks",
    "/projects/demo/documents",
    "/projects/demo/letters",
    "/projects/demo/updates",
  ]);
});

test("standalone contact card tabs are Activity / Details / More (expand)", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/contacts/c-1"), [
    "/contacts/c-1",
    "/contacts/c-1/details",
    "/contacts/c-1?contactLayout=page",
  ]);
  assert.deepEqual(resolveDesktopSectionTabHrefs("/contacts/c-1/details"), [
    "/contacts/c-1",
    "/contacts/c-1/details",
    "/contacts/c-1/details?contactLayout=page",
  ]);
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/contacts/c-1", "?crmGroup=g1"),
    [
      "/contacts/c-1?crmGroup=g1",
      "/contacts/c-1/details?crmGroup=g1",
      "/contacts/c-1?contactLayout=page&crmGroup=g1",
    ],
  );
});

test("expanded contact overlay disables section-tab number shortcuts", () => {
  assert.equal(
    resolveDesktopSectionTabHrefs("/contacts/c-1", "?contactLayout=page"),
    null,
  );
  assert.equal(
    resolveDesktopSectionTabHrefs(
      "/contacts/c-1/details",
      "?contactLayout=page&crmGroup=g1",
    ),
    null,
  );
});

test("standalone organization card tabs are Activity / Details / More (expand)", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/organizations/o-1"), [
    "/organizations/o-1",
    "/organizations/o-1/details",
    "/organizations/o-1?orgLayout=page",
  ]);
  assert.deepEqual(resolveDesktopSectionTabHrefs("/organizations/o-1/details"), [
    "/organizations/o-1",
    "/organizations/o-1/details",
    "/organizations/o-1/details?orgLayout=page",
  ]);
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/organizations/o-1", "?crmGroup=g1"),
    [
      "/organizations/o-1?crmGroup=g1",
      "/organizations/o-1/details?crmGroup=g1",
      "/organizations/o-1?orgLayout=page&crmGroup=g1",
    ],
  );
});

test("expanded organization overlay disables section-tab number shortcuts", () => {
  assert.equal(
    resolveDesktopSectionTabHrefs("/organizations/o-1", "?orgLayout=page"),
    null,
  );
  assert.equal(
    resolveDesktopSectionTabHrefs(
      "/organizations/o-1/details",
      "?orgLayout=page&crmGroup=g1",
    ),
    null,
  );
});

test("task detail routes disable section tab shortcuts", () => {
  assert.equal(
    resolveDesktopSectionTabHrefs("/projects/demo/tasks/demo-12"),
    null,
  );
  assert.equal(
    resolveDesktopSectionTabHrefs(
      "/organizations/acme/projects/demo/tasks/demo-12",
    ),
    null,
  );
  assert.equal(
    resolveDesktopSectionTabHrefs("/contacts/c-1/tasks/c-3"),
    null,
  );
  assert.equal(resolveDesktopSectionTabHrefs("/tasks/task-uuid-1"), null);
  assert.equal(resolveDesktopSectionTabHrefs("/tasks/today/demo-12"), null);
  assert.equal(resolveDesktopSectionTabHrefs("/inbox/demo-12"), null);
});

test("project tasks list section still exposes section tabs", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/tasks"), [
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
      "/organizations/acme/projects/demo/documents",
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
      "/projects/demo/documents",
      "/projects/demo/commits",
      "/projects/demo/pulls",
    ]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("mounted codebase workbench maps documents to Docs tab", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) =>
      selector === "[data-codebase-workbench]" ? {} : null,
  } as unknown as Document;

  try {
    assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/documents"), [
      "/projects/demo",
      "/projects/demo/files",
      "/projects/demo/documents",
      "/projects/demo/commits",
      "/projects/demo/pulls",
    ]);
    assert.deepEqual(
      resolveDesktopSectionTabHrefs("/projects/demo/documents/readme"),
      [
        "/projects/demo",
        "/projects/demo/files",
        "/projects/demo/documents",
        "/projects/demo/commits",
        "/projects/demo/pulls",
      ],
    );
  } finally {
    globalThis.document = previousDocument;
  }
});

test("mounted codebase workbench keeps Tasks/Files/Docs tabs on /tasks board route", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) =>
      selector === "[data-codebase-workbench]" ? {} : null,
  } as unknown as Document;

  try {
    assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/tasks"), [
      "/projects/demo",
      "/projects/demo/files",
      "/projects/demo/documents",
      "/projects/demo/commits",
      "/projects/demo/pulls",
    ]);
    assert.deepEqual(
      resolveDesktopSectionTabHrefs("/projects/demo/tasks", "?view=board"),
      [
        "/projects/demo",
        "/projects/demo/files",
        "/projects/demo/documents",
        "/projects/demo/commits",
        "/projects/demo/pulls",
      ],
    );
  } finally {
    globalThis.document = previousDocument;
  }
});

test("⌥[ / ⌥] resolve to previous / next section tab", () => {
  assert.equal(
    resolveSectionTabCycleShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "BracketLeft",
    }),
    "previous",
  );
  assert.equal(
    resolveSectionTabCycleShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      code: "BracketRight",
    }),
    "next",
  );
  assert.equal(
    resolveSectionTabCycleShortcut({
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
      code: "BracketLeft",
    }),
    null,
  );
});

test("findActiveSectionTabIndex matches nested codebase routes", () => {
  const tabs = [
    "/projects/demo",
    "/projects/demo/files",
    "/projects/demo/documents",
    "/projects/demo/commits",
    "/projects/demo/pulls",
  ];
  assert.equal(findActiveSectionTabIndex(tabs, "/projects/demo"), 0);
  assert.equal(findActiveSectionTabIndex(tabs, "/projects/demo/files"), 1);
  assert.equal(
    findActiveSectionTabIndex(tabs, "/projects/demo/documents/readme"),
    2,
  );
  assert.equal(
    findActiveSectionTabIndex(tabs, "/projects/demo/commits/abc123"),
    3,
  );
});

test("resolveAdjacentSectionTabHref cycles tasks due pills", () => {
  const tabs = resolveDesktopSectionTabHrefs("/tasks")!;
  assert.deepEqual(tabs, [
    "/tasks",
    "/tasks?due=tomorrow",
    "/tasks?due=this-week",
    "/tasks?due=next-week",
    "/tasks?due=overdue",
  ]);
  assert.equal(
    resolveAdjacentSectionTabHref(tabs, "/tasks", "", "next"),
    "/tasks?due=tomorrow",
  );
  assert.equal(
    resolveAdjacentSectionTabHref(tabs, "/tasks", "", "previous"),
    "/tasks?due=overdue",
  );
  assert.equal(
    resolveAdjacentSectionTabHref(
      tabs,
      "/tasks",
      "?due=tomorrow",
      "next",
    ),
    "/tasks?due=this-week",
  );
});

test("resolveAdjacentSectionTabHref cycles codebase workbench tabs", () => {
  const tabs = [
    "/projects/demo",
    "/projects/demo/files",
    "/projects/demo/documents",
    "/projects/demo/commits",
    "/projects/demo/pulls",
  ];
  assert.equal(
    resolveAdjacentSectionTabHref(tabs, "/projects/demo/files", "", "next"),
    "/projects/demo/documents",
  );
  assert.equal(
    resolveAdjacentSectionTabHref(
      tabs,
      "/projects/demo/commits/abc",
      "",
      "previous",
    ),
    "/projects/demo/documents",
  );
});