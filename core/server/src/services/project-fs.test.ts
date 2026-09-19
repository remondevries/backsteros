import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import * as projectFs from "./project-fs.js";

describe("project-fs", () => {
  let root: string | null = null;

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = null;
    }
  });

  async function makeRoot(): Promise<string> {
    root = await mkdtemp(path.join(tmpdir(), "backsteros-fs-"));
    return root;
  }

  it("lists entries and skips node_modules / dotfiles", async () => {
    const wd = await makeRoot();
    await mkdir(path.join(wd, "src"));
    await writeFile(path.join(wd, "README.md"), "# hi\n");
    await mkdir(path.join(wd, "node_modules"));
    await writeFile(path.join(wd, "node_modules", "x"), "x");
    await writeFile(path.join(wd, ".env"), "secret");

    const listed = await projectFs.listEntries(wd, "");
    assert.equal(listed.path, "");
    assert.deepEqual(
      listed.entries.map((e) => e.name).sort(),
      ["README.md", "src"],
    );
  });

  it("reads and writes text files via relative paths", async () => {
    const wd = await makeRoot();
    await mkdir(path.join(wd, "src"));
    await writeFile(path.join(wd, "src", "a.ts"), "const a = 1;\n");

    const read = await projectFs.readTextFile(wd, "src/a.ts");
    assert.equal(read.binary, false);
    assert.equal(read.content, "const a = 1;\n");
    assert.equal(read.path, "src/a.ts");

    const written = await projectFs.writeTextFile(
      wd,
      "src/a.ts",
      "const a = 2;\n",
    );
    assert.equal(written.content, "const a = 2;\n");
    assert.equal(
      await readFile(path.join(wd, "src", "a.ts"), "utf8"),
      "const a = 2;\n",
    );
  });

  it("creates and deletes files and directories", async () => {
    const wd = await makeRoot();
    const createdDir = await projectFs.createEntry(wd, "", "docs", "directory");
    assert.equal(createdDir.path, "docs");
    const createdFile = await projectFs.createEntry(
      wd,
      "docs",
      "note.md",
      "file",
    );
    assert.equal(createdFile.path, "docs/note.md");

    await projectFs.writeTextFile(wd, "docs/note.md", "hello\n");
    await projectFs.deleteEntry(wd, "docs/note.md");
    await projectFs.deleteEntry(wd, "docs");

    const listed = await projectFs.listEntries(wd, "");
    assert.equal(listed.entries.length, 0);
  });

  it("rejects path escape with ..", async () => {
    const wd = await makeRoot();
    await writeFile(path.join(wd, "safe.txt"), "ok\n");
    await assert.rejects(
      () => projectFs.readTextFile(wd, "../outside.txt"),
      (error: unknown) =>
        error instanceof projectFs.ProjectFsError &&
        error.code === "fs_path_outside_root",
    );
  });

  it("rejects absolute client paths", async () => {
    const wd = await makeRoot();
    await assert.rejects(
      () => projectFs.listEntries(wd, "/etc"),
      (error: unknown) =>
        error instanceof projectFs.ProjectFsError &&
        error.code === "fs_path_outside_root",
    );
  });

  it("rejects deleting the working directory root", async () => {
    const wd = await makeRoot();
    await assert.rejects(
      () => projectFs.deleteEntry(wd, ""),
      (error: unknown) =>
        error instanceof projectFs.ProjectFsError &&
        error.code === "fs_path_outside_root",
    );
  });

  it("blocks symlink escape outside the jail", async () => {
    const wd = await makeRoot();
    const outside = await mkdtemp(path.join(tmpdir(), "backsteros-fs-out-"));
    try {
      await writeFile(path.join(outside, "secret.txt"), "nope\n");
      await symlink(outside, path.join(wd, "link"));
      await assert.rejects(
        () => projectFs.readTextFile(wd, "link/secret.txt"),
        (error: unknown) =>
          error instanceof projectFs.ProjectFsError &&
          (error.code === "fs_path_outside_root" ||
            error.code === "fs_not_found"),
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("reports binary files without content", async () => {
    const wd = await makeRoot();
    await writeFile(path.join(wd, "blob.bin"), Buffer.from([0, 1, 2, 3, 4]));
    const read = await projectFs.readTextFile(wd, "blob.bin");
    assert.equal(read.binary, true);
    assert.equal(read.content, null);
  });

  it("lists markdown under docs/ and pins root AGENTS.md", async () => {
    const wd = await makeRoot();
    await writeFile(path.join(wd, "AGENTS.md"), "# agents\n");
    await writeFile(path.join(wd, "README.md"), "# readme\n");
    await mkdir(path.join(wd, "docs", "adr"), { recursive: true });
    await writeFile(path.join(wd, "docs", "00-vision.md"), "# vision\n");
    await writeFile(path.join(wd, "docs", "notes.txt"), "skip\n");
    await writeFile(path.join(wd, "docs", "adr", "001.md"), "# adr\n");
    await mkdir(path.join(wd, "src"));
    await writeFile(path.join(wd, "src", "hidden.md"), "# no\n");

    const listed = await projectFs.listRepoDocs(wd);
    assert.equal(listed.docsPresent, true);
    assert.deepEqual(
      listed.entries.map((entry) => ({
        path: entry.path,
        kind: entry.kind,
        pinned: entry.pinned,
      })),
      [
        { path: "AGENTS.md", kind: "file", pinned: true },
        { path: "docs", kind: "directory", pinned: false },
        { path: "docs/00-vision.md", kind: "file", pinned: false },
        { path: "docs/adr", kind: "directory", pinned: false },
        { path: "docs/adr/001.md", kind: "file", pinned: false },
      ],
    );
  });

  it("returns an empty tree when docs/ is missing and does not include other root files", async () => {
    const wd = await makeRoot();
    await writeFile(path.join(wd, "README.md"), "# readme\n");
    await mkdir(path.join(wd, "Documents"));
    await writeFile(path.join(wd, "Documents", "note.md"), "# vault\n");

    const listed = await projectFs.listRepoDocs(wd);
    assert.equal(listed.docsPresent, false);
    assert.deepEqual(listed.entries, []);
  });

  it("pins AGENTS.md when docs/ is missing", async () => {
    const wd = await makeRoot();
    await writeFile(path.join(wd, "AGENTS.md"), "# agents\n");

    const listed = await projectFs.listRepoDocs(wd);
    assert.equal(listed.docsPresent, false);
    assert.equal(listed.entries.length, 1);
    assert.equal(listed.entries[0]?.path, "AGENTS.md");
    assert.equal(listed.entries[0]?.pinned, true);
  });

  it("treats an empty docs/ folder as present with no entries", async () => {
    const wd = await makeRoot();
    await mkdir(path.join(wd, "docs"));
    await writeFile(path.join(wd, "docs", "diagram.png"), "not markdown");

    const listed = await projectFs.listRepoDocs(wd);
    assert.equal(listed.docsPresent, true);
    assert.deepEqual(listed.entries, []);
  });
});
