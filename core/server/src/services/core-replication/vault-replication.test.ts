import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  applyVaultFileDelete,
  applyVaultFilePut,
  diffVaultManifest,
  listMarkdownFiles,
  normalizeVaultMarkdownPath,
  planVaultPull,
  planVaultPullDeletes,
  resolveSafeVaultAbsolute,
  VaultPathError,
} from "./vault-replication.js";

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
});

describe("vault-replication filesystem", () => {
  it("lists markdown and skips AppleDouble sidecars", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vault-repl-"));
    await mkdir(path.join(root, "Journal"), { recursive: true });
    await writeFile(path.join(root, "Journal", "day.md"), "# hi\n");
    await writeFile(path.join(root, "Journal", "._day.md"), "junk");
    await writeFile(path.join(root, ".DS_Store"), "junk");

    const files = await listMarkdownFiles(root);
    assert.deepEqual(
      files.map((f) => f.relativePath),
      ["Journal/day.md"],
    );
  });

  it("applies put with mtime and delete", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vault-repl-"));
    const mtimeMs = Date.UTC(2026, 7, 25, 12, 0, 0);
    const contentBase64 = Buffer.from("# twin\n", "utf8").toString("base64");

    const applied = await applyVaultFilePut(root, {
      path: "Knowledge Base/note.md",
      mtimeMs,
      contentBase64,
    });
    assert.equal(applied, "applied");

    const skipped = await applyVaultFilePut(root, {
      path: "Knowledge Base/note.md",
      mtimeMs,
      contentBase64,
    });
    assert.equal(skipped, "skipped");

    // Newer stamp must overwrite
    const newer = mtimeMs + 60_000;
    const appliedAgain = await applyVaultFilePut(root, {
      path: "Knowledge Base/note.md",
      mtimeMs: newer,
      contentBase64: Buffer.from("# newer\n", "utf8").toString("base64"),
    });
    assert.equal(appliedAgain, "applied");

    // Force known mtime for listing stability
    await utimes(
      path.join(root, "Knowledge Base", "note.md"),
      newer / 1000,
      newer / 1000,
    );

    const deleted = await applyVaultFileDelete(root, "Knowledge Base/note.md");
    assert.equal(deleted, "applied");
  });
});
