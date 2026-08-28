import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  applyVaultFileDelete,
  applyVaultFilePut,
  listMarkdownFiles,
  markVaultMarkdownDirty,
  resetVaultListingStateForTests,
  resolveLocalMarkdownListing,
  writeVaultManifest,
} from "./vault-replication.js";

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

  it("reuses the manifest on a no-change tick (no full walk)", async () => {
    resetVaultListingStateForTests();
    const root = await mkdtemp(path.join(tmpdir(), "vault-repl-manifest-"));
    await mkdir(path.join(root, "Journal"), { recursive: true });
    await writeFile(path.join(root, "Journal", "day.md"), "# hi\n");
    await writeVaultManifest(root, {
      "Journal/day.md": { mtimeMs: 1_700_000_000_000, size: 5 },
      "Knowledge Base/ghost.md": { mtimeMs: 1, size: 1 },
    });

    const listing = await resolveLocalMarkdownListing(root, {
      "Journal/day.md": { mtimeMs: 1_700_000_000_000, size: 5 },
      "Knowledge Base/ghost.md": { mtimeMs: 1, size: 1 },
    });
    assert.equal(listing.scanned, "manifest");
    assert.deepEqual(
      listing.files.map((f) => f.relativePath),
      ["Journal/day.md", "Knowledge Base/ghost.md"],
    );
  });

  it("stats only dirty paths instead of walking the vault", async () => {
    resetVaultListingStateForTests();
    const root = await mkdtemp(path.join(tmpdir(), "vault-repl-dirty-"));
    await mkdir(path.join(root, "Journal"), { recursive: true });
    const dayPath = path.join(root, "Journal", "day.md");
    await writeFile(dayPath, "# edited\n");
    const info = await stat(dayPath);

    const previous = {
      "Journal/day.md": { mtimeMs: 1, size: 1 },
      "Journal/other.md": { mtimeMs: 2, size: 2 },
    };
    markVaultMarkdownDirty("Journal/day.md");
    const listing = await resolveLocalMarkdownListing(root, previous);
    assert.equal(listing.scanned, "dirty");
    const day = listing.files.find((f) => f.relativePath === "Journal/day.md");
    assert.ok(day);
    assert.equal(day.size, info.size);
    assert.equal(
      listing.files.find((f) => f.relativePath === "Journal/other.md")?.size,
      2,
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

  it("refuses to overwrite non-empty file with empty bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vault-repl-empty-"));
    const mtimeMs = Date.UTC(2026, 7, 25, 12, 0, 0);
    await applyVaultFilePut(root, {
      path: "Knowledge Base/keep.md",
      mtimeMs,
      contentBase64: Buffer.from("# keep me\n", "utf8").toString("base64"),
    });
    const skipped = await applyVaultFilePut(root, {
      path: "Knowledge Base/keep.md",
      mtimeMs: mtimeMs + 60_000,
      contentBase64: Buffer.from("", "utf8").toString("base64"),
    });
    assert.equal(skipped, "skipped");
  });
});
