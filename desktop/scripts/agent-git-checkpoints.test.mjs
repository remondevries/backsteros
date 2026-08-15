import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const {
  createGitCheckpoint,
  restoreGitCheckpoint,
  deleteGitCheckpoints,
} = await import("./agent-git-checkpoints.mjs");

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return String(stdout ?? "").trim();
}

test("create and restore checkpoint round-trip", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "backsteros-ckpt-"));
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Test"]);
  await fs.writeFile(path.join(root, "note.txt"), "v1\n");
  await git(root, ["add", "note.txt"]);
  await git(root, ["commit", "-m", "init"]);

  const checkpoint = await createGitCheckpoint(root, { turnId: "turn-1" });
  assert.ok(checkpoint.checkpointId);

  await fs.writeFile(path.join(root, "note.txt"), "v2\n");
  await fs.writeFile(path.join(root, "extra.txt"), "new\n");

  const restored = await restoreGitCheckpoint(root, checkpoint.checkpointId);
  assert.equal(restored.ok, true);
  assert.equal(await fs.readFile(path.join(root, "note.txt"), "utf8"), "v1\n");
  await assert.rejects(() => fs.access(path.join(root, "extra.txt")));

  await deleteGitCheckpoints(root, [checkpoint.checkpointId]);
});
