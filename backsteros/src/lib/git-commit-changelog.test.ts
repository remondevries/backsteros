import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGitCommitShow } from "./git-commit-changelog.js";

describe("parseGitCommitShow", () => {
  it("builds changelog rows from name-status, numstat, and patch", () => {
    const parsed = parseGitCommitShow({
      sha: "abc1234deadbeef",
      subject: "Ship record diffs",
      body: "Details",
      authorName: "Remon",
      authoredAt: "2026-11-02T09:00:00Z",
      nameStatus: [
        "M\tsrc/a.ts",
        "A\tsrc/b.ts",
        "D\told.ts",
        "R100\told-name.ts\tnew-name.ts",
      ].join("\n"),
      numstat: [
        "3\t1\tsrc/a.ts",
        "2\t0\tsrc/b.ts",
        "0\t4\told.ts",
        "1\t1\tnew-name.ts",
      ].join("\n"),
      patch: [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 111..222 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,2 +1,3 @@",
        " keep",
        "-gone",
        "+added",
        "+also",
        "diff --git a/src/b.ts b/src/b.ts",
        "new file mode 100644",
        "index 000..333",
        "--- /dev/null",
        "+++ b/src/b.ts",
        "@@ -0,0 +1,2 @@",
        "+one",
        "+two",
      ].join("\n"),
    });

    assert.equal(parsed.subject, "Ship record diffs");
    assert.equal(parsed.files.length, 4);
    assert.equal(parsed.additions, 6);
    assert.equal(parsed.deletions, 6);

    const a = parsed.files.find((file) => file.path === "src/a.ts");
    assert.ok(a);
    assert.equal(a.kind, "modified");
    assert.equal(a.additions, 3);
    assert.equal(a.deletions, 1);
    assert.deepEqual(
      a.preview.filter((line) => line.type === "add").map((line) => line.text),
      ["added", "also"],
    );

    const renamed = parsed.files.find((file) => file.path === "new-name.ts");
    assert.ok(renamed);
    assert.equal(renamed.kind, "renamed");
  });
});
