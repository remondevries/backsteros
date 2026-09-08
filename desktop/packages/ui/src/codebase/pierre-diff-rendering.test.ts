import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compactPartialHunkOffsets,
  parseGithubFilesToPierreDiffs,
  toUnifiedDiff,
} from "./pierre-diff-rendering.js";

describe("toUnifiedDiff", () => {
  it("wraps GitHub hunk-only patches with ---/+++ headers", () => {
    const patch = "@@ -1,2 +1,3 @@\n line\n+added\n";
    const unified = toUnifiedDiff("src/a.ts", null, patch, "modified");
    assert.match(unified, /^--- a\/src\/a\.ts\n\+\+\+ b\/src\/a\.ts\n/);
    assert.ok(unified.includes("@@ -1,2 +1,3 @@"));
  });

  it("uses /dev/null for added files", () => {
    const unified = toUnifiedDiff(
      "new.ts",
      null,
      "@@ -0,0 +1,1 @@\n+hi\n",
      "added",
    );
    assert.match(unified, /^--- \/dev\/null\n\+\+\+ b\/new\.ts\n/);
  });
});

describe("parseGithubFilesToPierreDiffs", () => {
  it("parses GitHub file patches into Pierre FileDiffMetadata", () => {
    const { fileDiffs, skipped } = parseGithubFilesToPierreDiffs(
      [
        {
          filename: "src/a.ts",
          previousFilename: null,
          status: "modified",
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: "@@ -1,1 +1,2 @@\n context\n+added\n",
        },
      ],
      "test-cache",
    );

    assert.equal(skipped.length, 0);
    assert.equal(fileDiffs.length, 1);
    assert.equal(fileDiffs[0]?.isPartial, true);
    const compacted = compactPartialHunkOffsets(fileDiffs[0]!);
    assert.equal(compacted.hunks[0]?.unifiedLineStart, 0);
  });

  it("skips binary / empty patches", () => {
    const { fileDiffs, skipped } = parseGithubFilesToPierreDiffs(
      [
        {
          filename: "bin.png",
          previousFilename: null,
          status: "added",
          additions: 0,
          deletions: 0,
          changes: 0,
          patch: null,
        },
      ],
      "test-cache",
    );
    assert.equal(fileDiffs.length, 0);
    assert.equal(skipped.length, 1);
  });
});
