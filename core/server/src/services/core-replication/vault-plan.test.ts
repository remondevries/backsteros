import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
  diffVaultManifest,
  normalizeVaultMarkdownPath,
  planVaultPull,
  planVaultPullDeletes,
  planVaultPush,
  pruneVaultManifest,
  resolveSafeVaultAbsolute,
  shouldPullVaultFile,
  shouldPushVaultFile,
  shouldSkipFullVaultWalk,
  shouldSkipVaultWalkDirectory,
  isSkippedVaultRelativePath,
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

  it("rewrites legacy Knowledge Base keys when reading the manifest", () => {
    const files = vaultFileMetaFromManifest({
      "Knowledge Base/note.md": { mtimeMs: 1, size: 10 },
      "Spaces/knowledge-base/second-brain/note.md": { mtimeMs: 2, size: 20 },
    });
    assert.deepEqual(files, [
      {
        relativePath: "Spaces/knowledge-base/second-brain/note.md",
        mtimeMs: 2,
        size: 20,
      },
    ]);
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

  it("rewrites legacy Knowledge Base paths into Second brain", () => {
    assert.equal(
      normalizeVaultMarkdownPath("Knowledge Base/agentmail/overview.md"),
      "Spaces/knowledge-base/second-brain/agentmail/overview.md",
    );
    assert.equal(
      resolveSafeVaultAbsolute(
        "/tmp/vault",
        "Knowledge Base/scratchpad.md",
      ),
      path.resolve(
        "/tmp/vault",
        "Spaces/knowledge-base/second-brain/scratchpad.md",
      ),
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

  it("mixed-build: filtered paths never produce deletes on either side", () => {
    // Old peer/local manifests still list ~60k node_modules entries. New builds
    // prune them; deletes must not fire because a path was filtered.
    const nodeModulesNoise = Array.from({ length: 200 }, (_, index) => ({
      relativePath: `Projects/App/Codebase/node_modules/pkg/file-${index}.md`,
      mtimeMs: 1,
      size: 1,
    }));
    const spacesLocal = [
      { relativePath: "Spaces/knowledge-base/second-brain/a.md", mtimeMs: 10, size: 10 },
      { relativePath: "Spaces/knowledge-base/second-brain/keep.md", mtimeMs: 20, size: 20 },
    ];
    const spacesPeer = [
      { relativePath: "Spaces/knowledge-base/second-brain/a.md", mtimeMs: 10, size: 10 },
      { relativePath: "Spaces/knowledge-base/second-brain/keep.md", mtimeMs: 20, size: 20 },
    ];
    const previousWithNoise: Record<string, { mtimeMs: number; size: number }> = {
      "Spaces/knowledge-base/second-brain/a.md": { mtimeMs: 10, size: 10 },
      "Spaces/knowledge-base/second-brain/keep.md": { mtimeMs: 20, size: 20 },
      "Spaces/knowledge-base/second-brain/gone.md": { mtimeMs: 30, size: 30 },
    };
    for (const file of nodeModulesNoise) {
      previousWithNoise[file.relativePath] = {
        mtimeMs: file.mtimeMs,
        size: file.size,
      };
    }

    // New local listing (filtered) + old peer listing that still includes noise:
    // incomplete-peer guard must use pruned counts, and noise paths never delete.
    const peerWithNoise = [...spacesPeer, ...nodeModulesNoise];
    const localFiltered = spacesLocal;
    const pullDeletes = planVaultPullDeletes(
      [
        ...localFiltered,
        {
          relativePath: "Spaces/knowledge-base/second-brain/gone.md",
          mtimeMs: 30,
          size: 30,
        },
      ],
      peerWithNoise,
      previousWithNoise,
    );
    assert.deepEqual(pullDeletes, ["Spaces/knowledge-base/second-brain/gone.md"]);
    assert.ok(
      !pullDeletes.some((path) => path.includes("node_modules")),
      "node_modules paths must never be pull-deleted",
    );

    // Push-side diff: previous has noise, current listing is filtered → noise
    // must not appear in deletes (would wipe peer copies on mixed builds).
    const pushDiff = diffVaultManifest(localFiltered, previousWithNoise);
    assert.ok(
      !pushDiff.deletes.some((path) => path.includes("node_modules")),
      "node_modules paths must never be push-deleted",
    );
    assert.ok(pushDiff.deletes.includes("Spaces/knowledge-base/second-brain/gone.md"));
  });

  it("mixed-build: pruned counts unblock legitimate deletes when peer filter shrinks the listing", () => {
    // Local still has a fat previous manifest (old build). Peer is new and only
    // returns real Spaces files. After prune, incomplete-peer guard must not
    // block deleting a real Spaces path that is gone on the peer.
    const noisePrevious: Record<string, { mtimeMs: number; size: number }> = {};
    for (let i = 0; i < 80; i += 1) {
      noisePrevious[`Projects/App/Codebase/node_modules/pkg/${i}.md`] = {
        mtimeMs: 1,
        size: 1,
      };
    }
    noisePrevious["Spaces/note.md"] = { mtimeMs: 5, size: 5 };
    noisePrevious["Spaces/gone.md"] = { mtimeMs: 6, size: 6 };

    const local = [
      { relativePath: "Spaces/note.md", mtimeMs: 5, size: 5 },
      { relativePath: "Spaces/gone.md", mtimeMs: 6, size: 6 },
    ];
    const peer = [{ relativePath: "Spaces/note.md", mtimeMs: 5, size: 5 }];

    // Without pruning, localCount from a fat listing would trip the 25% guard.
    // With pruning, only Spaces paths count → gone.md deletes.
    const deletes = planVaultPullDeletes(local, peer, noisePrevious);
    assert.deepEqual(deletes, ["Spaces/gone.md"]);
  });

  it("rejects skipped vault paths in normalizeVaultMarkdownPath", () => {
    assert.throws(
      () =>
        normalizeVaultMarkdownPath(
          "Projects/App/Codebase/node_modules/x/readme.md",
        ),
      VaultPathError,
    );
    assert.throws(
      () => normalizeVaultMarkdownPath(".git/hooks/note.md"),
      VaultPathError,
    );
    assert.throws(
      () => normalizeVaultMarkdownPath(".hidden/secret.md"),
      VaultPathError,
    );
    assert.equal(shouldSkipVaultWalkDirectory("node_modules"), true);
    assert.equal(isSkippedVaultRelativePath("Projects/x/node_modules/a.md"), true);
    assert.deepEqual(
      Object.keys(
        pruneVaultManifest({
          "Spaces/a.md": { mtimeMs: 1, size: 1 },
          "Projects/x/node_modules/a.md": { mtimeMs: 1, size: 1 },
        }),
      ),
      ["Spaces/a.md"],
    );
  });
});

