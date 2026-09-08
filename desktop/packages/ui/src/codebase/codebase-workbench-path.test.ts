import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getCodebaseWorkbenchHref,
  isCodebaseWorkbenchPath,
  parseCodebaseWorkbenchPath,
} from "./codebase-workbench-path.js";

test("parseCodebaseWorkbenchPath maps documents to Docs tab", () => {
  assert.deepEqual(parseCodebaseWorkbenchPath("/projects/demo/documents", "demo"), {
    tab: "docs",
    commitSha: null,
    pullNumber: null,
    filePath: null,
    documentPath: null,
  });
  assert.deepEqual(
    parseCodebaseWorkbenchPath("/projects/demo/documents/guides/setup", "demo"),
    {
      tab: "docs",
      commitSha: null,
      pullNumber: null,
      filePath: null,
      documentPath: "guides/setup",
    },
  );
});

test("getCodebaseWorkbenchHref builds Docs routes", () => {
  assert.equal(
    getCodebaseWorkbenchHref("demo", { tab: "docs" }),
    "/projects/demo/documents",
  );
  assert.equal(
    getCodebaseWorkbenchHref("demo", {
      tab: "docs",
      documentPath: "guides/setup",
    }),
    "/projects/demo/documents/guides/setup",
  );
});

test("isCodebaseWorkbenchPath treats documents as a workbench route", () => {
  assert.equal(isCodebaseWorkbenchPath("/projects/demo/documents", "demo"), true);
  assert.equal(
    isCodebaseWorkbenchPath("/projects/demo/documents/readme", "demo"),
    true,
  );
  assert.equal(isCodebaseWorkbenchPath("/projects/demo", "demo"), false);
});
