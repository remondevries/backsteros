import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CODEBASE_PROJECT_README_FILENAME,
  isCodebaseProjectReadmeFileName,
  resolveCodebaseProjectReadmeFileName,
} from "./codebase-project-readme.js";

test("isCodebaseProjectReadmeFileName matches common casings", () => {
  assert.equal(isCodebaseProjectReadmeFileName("README.md"), true);
  assert.equal(isCodebaseProjectReadmeFileName("readme.md"), true);
  assert.equal(isCodebaseProjectReadmeFileName("Readme.md"), true);
  assert.equal(isCodebaseProjectReadmeFileName("README.MD"), true);
  assert.equal(isCodebaseProjectReadmeFileName("AGENTS.md"), false);
  assert.equal(isCodebaseProjectReadmeFileName("readme.txt"), false);
});

test("resolveCodebaseProjectReadmeFileName keeps on-disk casing", () => {
  assert.equal(
    resolveCodebaseProjectReadmeFileName(["src", "readme.md", "package.json"]),
    "readme.md",
  );
  assert.equal(
    resolveCodebaseProjectReadmeFileName(["docs", "LICENSE"]),
    CODEBASE_PROJECT_README_FILENAME,
  );
});
