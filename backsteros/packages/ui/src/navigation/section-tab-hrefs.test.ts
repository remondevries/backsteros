import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findActiveSectionTabIndex,
  resolveAdjacentSectionTabHref,
  resolveDesktopSectionTabHrefs,
  resolveSectionTabCycleShortcut,
} from "./section-tab-hrefs.js";

/** Matches chrome `CODEBASE_LIST_TAB_OPTIONS` / hotkey CODEBASE_LIST_TABS. */
const CODEBASE_WORKBENCH_TAB_HREFS = [
  "/projects/demo",
  "/projects/demo/tasks",
  "/projects/demo/files",
  "/projects/demo/documents",
  "/projects/demo/commits",
  "/projects/demo/pulls",
  "/projects/demo/updates",
  "/projects/demo/timetracking",
] as const;

test("projects list uses area filter tabs with Other instead of All", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects"), [
    "/projects",
    "/projects?area=business",
    "/projects?area=clients",
    "/projects?area=other",
  ]);
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/projects", "?area=other&view=board"),
    [
      "/projects?view=board",
      "/projects?area=business&view=board",
      "/projects?area=clients&view=board",
      "/projects?area=other&view=board",
    ],
  );
});

test("projects list omits Other from number-key tabs when the bucket is empty", async () => {
  const { setProjectsListIncludeOtherArea } = await import(
    "../projects/project-areas.js"
  );
  setProjectsListIncludeOtherArea(false);
  try {
    assert.deepEqual(resolveDesktopSectionTabHrefs("/projects"), [
      "/projects",
      "/projects?area=business",
      "/projects?area=clients",
    ]);
  } finally {
    setProjectsListIncludeOtherArea(true);
  }
});

test("project overview uses default section tabs when workbench is not mounted", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo"), [
    "/projects/demo",
    "/projects/demo/tasks",
    "/projects/demo/documents",
    "/projects/demo/letters",
    "/projects/demo/updates",
    "/projects/demo/timetracking",
  ]);
});

test("codebase workbench routes use Overview/Tasks/Files/Docs/Commits/PRs/Updates/Timetracking tabs", () => {
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/projects/demo/files"),
    [...CODEBASE_WORKBENCH_TAB_HREFS],
  );
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/projects/demo/commits/abc"),
    [...CODEBASE_WORKBENCH_TAB_HREFS],
  );
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/projects/demo/pulls/12"),
    [...CODEBASE_WORKBENCH_TAB_HREFS],
  );
});

test("standard project updates stay on default tabs when workbench is not mounted", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/updates"), [
    "/projects/demo",
    "/projects/demo/tasks",
    "/projects/demo/documents",
    "/projects/demo/letters",
    "/projects/demo/updates",
    "/projects/demo/timetracking",
  ]);
});

test("standard project documents stay on default tabs when workbench is not mounted", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/documents"), [
    "/projects/demo",
    "/projects/demo/tasks",
    "/projects/demo/documents",
    "/projects/demo/letters",
    "/projects/demo/updates",
    "/projects/demo/timetracking",
  ]);
});

test("project letters keep default section tabs so digit 1 goes to Overview", () => {
  assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/letters"), [
    "/projects/demo",
    "/projects/demo/tasks",
    "/projects/demo/documents",
    "/projects/demo/letters",
    "/projects/demo/updates",
    "/projects/demo/timetracking",
  ]);
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/projects/demo/letters/letter-1"),
    [
      "/projects/demo",
      "/projects/demo/tasks",
      "/projects/demo/documents",
      "/projects/demo/letters",
      "/projects/demo/updates",
      "/projects/demo/timetracking",
    ],
  );
});

test("standalone contact card tabs are Activity / Details / expand (no portal)", () => {
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

test("standalone contact card tabs include Portal / Logs before expand when mounted", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) =>
      selector === "[data-contact-card-section-ids]"
        ? {
            getAttribute: (name: string) =>
              name === "data-contact-card-section-ids"
                ? "overview,details,portal,logs"
                : null,
          }
        : null,
  } as unknown as Document;

  try {
    assert.deepEqual(resolveDesktopSectionTabHrefs("/contacts/c-1"), [
      "/contacts/c-1",
      "/contacts/c-1/details",
      "/contacts/c-1/portal",
      "/contacts/c-1/logs",
      "/contacts/c-1?contactLayout=page",
    ]);
    assert.deepEqual(resolveDesktopSectionTabHrefs("/contacts/c-1/portal"), [
      "/contacts/c-1",
      "/contacts/c-1/details",
      "/contacts/c-1/portal",
      "/contacts/c-1/logs",
      "/contacts/c-1/portal?contactLayout=page",
    ]);
  } finally {
    globalThis.document = previousDocument;
  }
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
    "/projects/demo/timetracking",
  ]);
});

test("org-scoped codebase workbench routes use scoped tab hrefs", () => {
  assert.deepEqual(
    resolveDesktopSectionTabHrefs("/organizations/acme/projects/demo/files"),
    [
      "/organizations/acme/projects/demo",
      "/organizations/acme/projects/demo/tasks",
      "/organizations/acme/projects/demo/files",
      "/organizations/acme/projects/demo/documents",
      "/organizations/acme/projects/demo/commits",
      "/organizations/acme/projects/demo/pulls",
      "/organizations/acme/projects/demo/updates",
      "/organizations/acme/projects/demo/timetracking",
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
      ...CODEBASE_WORKBENCH_TAB_HREFS,
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
      ...CODEBASE_WORKBENCH_TAB_HREFS,
    ]);
    assert.deepEqual(
      resolveDesktopSectionTabHrefs("/projects/demo/documents/readme"),
      [...CODEBASE_WORKBENCH_TAB_HREFS],
    );
    assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/updates"), [
      ...CODEBASE_WORKBENCH_TAB_HREFS,
    ]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("mounted codebase workbench keeps workbench tabs on /tasks board route", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector: string) =>
      selector === "[data-codebase-workbench]" ? {} : null,
  } as unknown as Document;

  try {
    assert.deepEqual(resolveDesktopSectionTabHrefs("/projects/demo/tasks"), [
      ...CODEBASE_WORKBENCH_TAB_HREFS,
    ]);
    assert.deepEqual(
      resolveDesktopSectionTabHrefs("/projects/demo/tasks", "?view=board"),
      [...CODEBASE_WORKBENCH_TAB_HREFS],
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
  const tabs = [...CODEBASE_WORKBENCH_TAB_HREFS];
  assert.equal(findActiveSectionTabIndex(tabs, "/projects/demo"), 0);
  assert.equal(findActiveSectionTabIndex(tabs, "/projects/demo/tasks"), 1);
  assert.equal(findActiveSectionTabIndex(tabs, "/projects/demo/files"), 2);
  assert.equal(
    findActiveSectionTabIndex(tabs, "/projects/demo/documents/readme"),
    3,
  );
  assert.equal(
    findActiveSectionTabIndex(tabs, "/projects/demo/commits/abc123"),
    4,
  );
  assert.equal(
    findActiveSectionTabIndex(tabs, "/projects/demo/timetracking"),
    7,
  );
});

test("resolveAdjacentSectionTabHref cycles tasks due pills", () => {
  const tabs = resolveDesktopSectionTabHrefs("/tasks")!;
  // `buildTasksDueHref` always emits `due` (bare `/tasks` is the keep-alive
  // "restore last" target), so the Today pill is `/tasks?due=today`.
  assert.deepEqual(tabs, [
    "/tasks?due=today",
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
  const tabs = [...CODEBASE_WORKBENCH_TAB_HREFS];
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
  assert.equal(
    resolveAdjacentSectionTabHref(
      tabs,
      "/projects/demo/timetracking",
      "",
      "next",
    ),
    "/projects/demo",
  );
});