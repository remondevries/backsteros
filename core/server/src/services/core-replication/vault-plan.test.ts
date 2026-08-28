import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  diffVaultManifest,
  normalizeVaultMarkdownPath,
  planVaultPull,
  planVaultPullDeletes,
  planVaultPush,
  resolveSafeVaultAbsolute,
  shouldPullVaultFile,
  shouldPushVaultFile,
  shouldSkipFullVaultWalk,
  vaultFileMetaFromManifest,
  applyDirtyVaultPathStats,
  VaultPathError,
} from "./vault-plan.js";

describe("vault-replication manifest-first listing", () => {
  it("skips full walk when manifest is warm and nothing is dirty", () => {
    assert.equal(
      shouldSkipFullVaultWalk({
        manifestEntryCount: 12,
        dirtyPaths: [],
        forceFullScan: false,
      }),
      true,
    );
  });

  it("walks when manifest is empty, forced, or wildcard-dirty", () => {
    assert.equal(
      shouldSkipFullVaultWalk({
        manifestEntryCount: 0,
        dirtyPaths: [],
        forceFullScan: false,
      }),
      false,
    );
    assert.equal(
      shouldSkipFullVaultWalk({
        manifestEntryCount: 12,
        dirtyPaths: [],
        forceFullScan: true,
      }),
      false,
    );
    assert.equal(
      shouldSkipFullVaultWalk({
        manifestEntryCount: 12,
        dirtyPaths: ["*"],
        forceFullScan: false,
      }),
      false,
    );
  });

  it("does not skip when specific paths are dirty (stat those only)", () => {
    assert.equal(
      shouldSkipFullVaultWalk({
        manifestEntryCount: 12,
        dirtyPaths: ["Journal/day.md"],
        forceFullScan: false,
      }),
      false,
    );
  });

  it("builds file meta from manifest without FS", () => {
    const files = vaultFileMetaFromManifest({
      "b.md": { mtimeMs: 2, size: 20 },
      "a.md": { mtimeMs: 1, size: 10 },
    });
    assert.deepEqual(
      files.map((f) => f.relativePath),
      ["a.md", "b.md"],
    );
  });

  it("merges dirty stats into the previous listing", () => {
    const files = applyDirtyVaultPathStats({
      previous: {
        "keep.md": { mtimeMs: 1, size: 1 },
        "gone.md": { mtimeMs: 2, size: 2 },
        "edit.md": { mtimeMs: 3, size: 3 },
      },
      dirtyStats: new Map([
        ["gone.md", null],
        ["edit.md", { mtimeMs: 99, size: 9 }],
        ["new.md", { mtimeMs: 5, size: 5 }],
      ]),
    });
    assert.deepEqual(
      files.map((f) => ({ path: f.relativePath, size: f.size })),
      [
        { path: "edit.md", size: 9 },
        { path: "keep.md", size: 1 },
        { path: "new.md", size: 5 },
      ],
    );
  });
});

describe("vault-replication paths", () => {
  it("normalizes relative markdown paths", () => {
    assert.equal(
      normalizeVaultMarkdownPath("Journal/2026-08-25.md"),
      "Journal/2026-08-25.md",
    );
    assert.equal(
      normalizeVaultMarkdownPath("Projects/Foo/Documents/note.md"),
      "Projects/Foo/Documents/note.md",
    );
  });

  it("rejects traversal, absolute, non-md, and AppleDouble names", () => {
    assert.throws(() => normalizeVaultMarkdownPath("../secret.md"), VaultPathError);
    assert.throws(() => normalizeVaultMarkdownPath("/etc/passwd.md"), VaultPathError);
    assert.throws(() => normalizeVaultMarkdownPath("Projects/foo/readme.txt"), VaultPathError);
    assert.throws(() => normalizeVaultMarkdownPath("Journal/._note.md"), VaultPathError);
    assert.throws(
      () => resolveSafeVaultAbsolute("/tmp/vault", "Journal/../../etc/passwd.md"),
      VaultPathError,
    );
  });
});

describe("vault-replication manifest diff", () => {
  it("detects creates, mtime updates, and deletes", () => {
    const diff = diffVaultManifest(
      [
        { relativePath: "a.md", mtimeMs: 100, size: 10 },
        { relativePath: "b.md", mtimeMs: 300, size: 20 },
      ],
      {
        "a.md": { mtimeMs: 100, size: 10 },
        "b.md": { mtimeMs: 200, size: 20 },
        "c.md": { mtimeMs: 1, size: 1 },
      },
    );
    assert.deepEqual(
      diff.upserts.map((f) => f.relativePath),
      ["b.md"],
    );
    assert.deepEqual(diff.deletes, ["c.md"]);
  });

  it("treats size changes as upserts", () => {
    const diff = diffVaultManifest(
      [{ relativePath: "a.md", mtimeMs: 100, size: 11 }],
      { "a.md": { mtimeMs: 100, size: 10 } },
    );
    assert.equal(diff.upserts.length, 1);
    assert.equal(diff.deletes.length, 0);
  });
});

describe("vault-replication pull planning", () => {
  it("pulls missing and strictly newer peer files (LWW by mtime)", () => {
    const pulls = planVaultPull(
      [
        { relativePath: "a.md", mtimeMs: 100, size: 1 },
        { relativePath: "b.md", mtimeMs: 200, size: 1 },
      ],
      [
        { relativePath: "a.md", mtimeMs: 150, size: 2 },
        { relativePath: "b.md", mtimeMs: 200, size: 1 },
        { relativePath: "c.md", mtimeMs: 1, size: 1 },
      ],
    );
    assert.deepEqual(
      pulls.map((f) => f.relativePath),
      ["a.md", "c.md"],
    );
  });

  it("pulls from peer when local file is empty but peer has content", () => {
    const pulls = planVaultPull(
      [{ relativePath: "note.md", mtimeMs: 500, size: 0 }],
      [{ relativePath: "note.md", mtimeMs: 400, size: 355 }],
    );
    assert.deepEqual(pulls.map((f) => f.relativePath), ["note.md"]);
  });

  it("does not pull empty peer over non-empty local even with newer mtime", () => {
    assert.equal(
      shouldPullVaultFile(
        { relativePath: "note.md", mtimeMs: 500, size: 0 },
        { relativePath: "note.md", mtimeMs: 400, size: 355 },
      ),
      false,
    );
    const pulls = planVaultPull(
      [{ relativePath: "note.md", mtimeMs: 400, size: 355 }],
      [{ relativePath: "note.md", mtimeMs: 500, size: 0 }],
    );
    assert.deepEqual(pulls, []);
  });

  it("still pulls empty peer when local is already empty", () => {
    const pulls = planVaultPull(
      [{ relativePath: "note.md", mtimeMs: 400, size: 0 }],
      [{ relativePath: "note.md", mtimeMs: 500, size: 0 }],
    );
    assert.deepEqual(pulls.map((f) => f.relativePath), ["note.md"]);
  });

  it("does not push empty local over non-empty peer even with newer mtime", () => {
    assert.equal(
      shouldPushVaultFile(
        { relativePath: "note.md", mtimeMs: 500, size: 0 },
        { relativePath: "note.md", mtimeMs: 400, size: 355 },
      ),
      false,
    );
    const pushes = planVaultPush(
      [{ relativePath: "note.md", mtimeMs: 500, size: 0 }],
      [{ relativePath: "note.md", mtimeMs: 400, size: 355 }],
    );
    assert.deepEqual(pushes, []);
  });

  it("pushes when local is non-empty and newer or peer missing", () => {
    assert.equal(
      shouldPushVaultFile(
        { relativePath: "note.md", mtimeMs: 500, size: 10 },
        { relativePath: "note.md", mtimeMs: 400, size: 355 },
      ),
      true,
    );
    assert.equal(
      shouldPushVaultFile(
        { relativePath: "new.md", mtimeMs: 1, size: 0 },
        undefined,
      ),
      true,
    );
  });

  it("deletes local copies only when they still match the synced manifest", () => {
    const deletes = planVaultPullDeletes(
      [
        { relativePath: "gone.md", mtimeMs: 50, size: 3 },
        { relativePath: "edited.md", mtimeMs: 99, size: 9 },
      ],
      [],
      {
        "gone.md": { mtimeMs: 50, size: 3 },
        "edited.md": { mtimeMs: 50, size: 3 },
      },
    );
    assert.deepEqual(deletes, ["gone.md"]);
  });

  it("skips remote deletes when the peer manifest is far behind local", () => {
    const local = Array.from({ length: 100 }, (_, index) => ({
      relativePath: `file-${index}.md`,
      mtimeMs: 100,
      size: 10,
    }));
    const deletes = planVaultPullDeletes(local, [], {
      "file-0.md": { mtimeMs: 100, size: 10 },
    });
    assert.deepEqual(deletes, []);
  });
});

