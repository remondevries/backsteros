import assert from "node:assert/strict";
import { test } from "node:test";

import { codebaseRepoDocsToListItems } from "./codebase-repo-docs";

test("codebaseRepoDocsToListItems pins AGENTS.md and nests docs/", () => {
  const items = codebaseRepoDocsToListItems("proj-1", [
    { name: "AGENTS.md", path: "AGENTS.md", kind: "file", pinned: true },
    { name: "docs", path: "docs", kind: "directory", pinned: false },
    {
      name: "00-vision.md",
      path: "docs/00-vision.md",
      kind: "file",
      pinned: false,
    },
    { name: "adr", path: "docs/adr", kind: "directory", pinned: false },
  ]);

  assert.equal(items[0]?.id, "AGENTS.md");
  assert.equal(items[0]?.parentId, null);
  assert.equal(items[0]?.sortOrder, -1);
  assert.equal(items[0]?.kind, "document");

  const docs = items.find((item) => item.id === "docs");
  assert.equal(docs?.kind, "folder");
  assert.equal(docs?.parentId, null);
  assert.equal(docs?.sortOrder, 0);

  const vision = items.find((item) => item.id === "docs/00-vision.md");
  assert.equal(vision?.parentId, "docs");
  assert.equal(vision?.kind, "document");
  assert.equal(vision?.projectId, "proj-1");

  const adr = items.find((item) => item.id === "docs/adr");
  assert.equal(adr?.parentId, "docs");
  assert.equal(adr?.kind, "folder");
});
