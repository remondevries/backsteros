#!/usr/bin/env node
/**
 * macOS node-pty hygiene for the development console PTY server:
 *
 * 1. pnpm preserves prebuild modes from the npm tarball, which ships
 *    `spawn-helper` without +x → runtime "posix_spawnp failed".
 * 2. node-pty@1.1.0 leaks one PTY fd per spawn (off-by-one close of the
 *    low-fd probe). After ~kern.tty.ptmx_max opens the server can't spawn
 *    and surfaces the same "posix_spawnp failed" error.
 *
 * Re-apply execute bits, patch the leak if present, and rebuild natives.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LEAKY_CLOSE = `  for (; count > 0; count--) {
    close(low_fds[count]);
  }`;

const FIXED_CLOSE = `  // Close probe PTYs used to push past fds 0–2. The old loop was off-by-one and
  // leaked one PTY per spawn when stdin/out/err were already open (typical in
  // Node) — exhausting kern.tty.ptmx_max (~511) and surfacing as
  // "posix_spawnp failed".
  for (size_t i = 0; i <= count && i < 3; i++) {
    if (low_fds[i] >= 0) {
      close(low_fds[i]);
    }
  }`;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "spawn-helper") out.push(full);
  }
  return out;
}

function resolvePtyPackageRoot() {
  try {
    const ptyEntry = require.resolve("node-pty");
    let dir = path.dirname(ptyEntry);
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(dir, "package.json"))) return dir;
      dir = path.dirname(dir);
    }
  } catch {
    /* fall through */
  }
  return path.resolve(__dirname, "../node_modules/node-pty");
}

function patchPtyLeak(ptyRoot) {
  const ptyCc = path.join(ptyRoot, "src/unix/pty.cc");
  if (!fs.existsSync(ptyCc)) return false;
  const source = fs.readFileSync(ptyCc, "utf8");
  if (!source.includes(LEAKY_CLOSE)) {
    if (source.includes("i <= count && i < 3")) {
      console.log("[fix-node-pty-perms] PTY probe-fd leak already patched");
      return false;
    }
    return false;
  }
  fs.writeFileSync(ptyCc, source.replace(LEAKY_CLOSE, FIXED_CLOSE));
  console.log(`[fix-node-pty-perms] patched PTY probe-fd leak in ${ptyCc}`);
  return true;
}

function rebuildPty(ptyRoot) {
  if (process.platform !== "darwin" && process.platform !== "linux") return;
  console.log("[fix-node-pty-perms] rebuilding node-pty natives…");
  const fallback = spawnSync("npx", ["--yes", "node-gyp", "rebuild"], {
    cwd: ptyRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (fallback.status !== 0) {
    console.warn(
      "[fix-node-pty-perms] node-gyp rebuild failed — run: cd <node-pty> && npx node-gyp rebuild",
    );
  }
}

const ptyRoot = resolvePtyPackageRoot();
const patched = patchPtyLeak(ptyRoot);
if (patched) {
  rebuildPty(ptyRoot);
}

const roots = [ptyRoot, path.resolve(__dirname, "../../../node_modules")];
const helpers = new Set();
for (const root of roots) {
  for (const file of walk(root)) helpers.add(file);
}

let fixed = 0;
for (const file of helpers) {
  try {
    fs.chmodSync(file, 0o755);
    fixed += 1;
    console.log(`[fix-node-pty-perms] chmod +x ${file}`);
  } catch (error) {
    console.warn(`[fix-node-pty-perms] skip ${file}:`, error.message);
  }
}

if (fixed === 0) {
  console.log("[fix-node-pty-perms] no spawn-helper found (ok on non-macOS)");
}
