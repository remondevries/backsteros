/**
 * T3-style full worktree+index git checkpoints for agent turns.
 * Stored as hidden refs: refs/backsteros/checkpoints/<checkpointId>
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
async function git(cwd, args, env) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    timeout: 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return String(stdout ?? "").trim();
}

function newCheckpointId(turnId) {
  const suffix = randomBytes(4).toString("hex");
  const base =
    typeof turnId === "string" && turnId.trim()
      ? turnId.trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 48)
      : "turn";
  return `${base}-${suffix}`;
}

/**
 * @param {string} cwd
 * @param {{ turnId?: string | null }} [options]
 * @returns {Promise<{ checkpointId: string, ref: string, headSha: string | null }>}
 */
export async function createGitCheckpoint(cwd, options = {}) {
  const root = typeof cwd === "string" ? cwd.trim() : "";
  if (!root) throw new Error("cwd is required");

  let headSha = null;
  try {
    headSha = await git(root, ["rev-parse", "HEAD"]);
  } catch {
    headSha = null;
  }

  const checkpointId = newCheckpointId(options.turnId);
  const ref = `refs/backsteros/checkpoints/${checkpointId}`;
  const tmpIndex = path.join(
    os.tmpdir(),
    `backsteros-ckpt-${checkpointId}.index`,
  );
  const env = { GIT_INDEX_FILE: tmpIndex };

  try {
    try {
      await git(root, ["read-tree", "HEAD"], env);
    } catch {
      // Empty / unborn repo — start from an empty index.
      await fs.writeFile(tmpIndex, "");
    }
    await git(root, ["add", "-A", "--", "."], env);
    const tree = await git(root, ["write-tree"], env);
    const parentArgs = headSha ? ["-p", headSha] : [];
    const commit = await git(
      root,
      [
        "commit-tree",
        tree,
        ...parentArgs,
        "-m",
        `backsteros checkpoint ${checkpointId}`,
      ],
      env,
    );
    await git(root, ["update-ref", ref, commit]);
    return { checkpointId, ref, headSha };
  } finally {
    await fs.rm(tmpIndex, { force: true }).catch(() => undefined);
  }
}

/**
 * @param {string} cwd
 * @param {string} checkpointId
 * @returns {Promise<{ ok: true, restored: true, checkpointId: string, commit: string }>}
 */
export async function restoreGitCheckpoint(cwd, checkpointId) {
  const root = typeof cwd === "string" ? cwd.trim() : "";
  const id = typeof checkpointId === "string" ? checkpointId.trim() : "";
  if (!root) throw new Error("cwd is required");
  if (!id) throw new Error("checkpointId is required");

  const ref = `refs/backsteros/checkpoints/${id}`;
  const commit = await git(root, ["rev-parse", ref]);
  await git(root, [
    "restore",
    "--source",
    commit,
    "--worktree",
    "--staged",
    "--",
    ".",
  ]);
  await git(root, ["clean", "-fd", "--", "."]);
  return { ok: true, restored: true, checkpointId: id, commit };
}

/**
 * @param {string} cwd
 * @param {readonly string[]} checkpointIds
 */
export async function deleteGitCheckpoints(cwd, checkpointIds) {
  const root = typeof cwd === "string" ? cwd.trim() : "";
  if (!root) return { deleted: [] };
  /** @type {string[]} */
  const deleted = [];
  for (const raw of checkpointIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    const ref = `refs/backsteros/checkpoints/${id}`;
    try {
      await git(root, ["update-ref", "-d", ref]);
      deleted.push(id);
    } catch {
      /* missing ref is fine */
    }
  }
  return { deleted };
}
