import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_CODEBASE_DOCS_SOURCE_MODE,
  codebaseDocsSourceModeLabel,
  isCodebaseDocsSourceMode,
  parseCodebaseDocsSourceMode,
} from "./codebase-docs-source-mode.js";

describe("codebase docs source mode", () => {
  it("parses repo and local", () => {
    assert.equal(parseCodebaseDocsSourceMode("repo"), "repo");
    assert.equal(parseCodebaseDocsSourceMode("Local"), "local");
    assert.equal(parseCodebaseDocsSourceMode("  REPO  "), "repo");
  });

  it("falls back to repo for unknown values", () => {
    assert.equal(
      parseCodebaseDocsSourceMode(undefined),
      DEFAULT_CODEBASE_DOCS_SOURCE_MODE,
    );
    assert.equal(parseCodebaseDocsSourceMode(""), "repo");
    assert.equal(parseCodebaseDocsSourceMode("vault"), "repo");
  });

  it("labels and type-guards modes", () => {
    assert.equal(isCodebaseDocsSourceMode("repo"), true);
    assert.equal(isCodebaseDocsSourceMode("local"), true);
    assert.equal(isCodebaseDocsSourceMode("docs"), false);
    assert.equal(codebaseDocsSourceModeLabel("repo"), "Repo");
    assert.equal(codebaseDocsSourceModeLabel("local"), "Local");
  });
});
