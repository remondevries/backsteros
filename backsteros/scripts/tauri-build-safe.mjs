#!/usr/bin/env node
/**
 * Run `tauri build` without installing over /Applications/BacksterOS.app.
 * On macOS the default bundle is `app` only (no DMG). Windows/Linux keep
 * tauri.conf.json targets (msi/nsis). After the build, fail if any
 * BacksterOS*.app under /Applications changed (including nested binaries).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  describeBacksterAppChanges,
  snapshotBacksterApps,
  withDefaultTauriBundles,
} from "./macos-packaging.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const applicationsDir = process.env.INSTALL_APPLICATIONS_DIR?.trim() || "/Applications";

const passthrough = process.argv.slice(2).filter((a) => a !== "--");
const tauriArgs = withDefaultTauriBundles(["build", ...passthrough]);

const before = snapshotBacksterApps(applicationsDir);
const result = spawnSync("tauri", tauriArgs, {
  cwd: desktopRoot,
  stdio: "inherit",
  env: process.env,
  shell: false,
});
if (result.error) {
  console.error("[tauri-build-safe] failed to spawn tauri:", result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const after = snapshotBacksterApps(applicationsDir);
const changes = describeBacksterAppChanges(before, after);
if (changes.length > 0) {
  console.error(
    `[tauri-build-safe] build modified ${applicationsDir} (${changes.join(", ")}). ` +
      "That is not allowed; install with `pnpm --filter @backsteros/desktop install:macos` instead.",
  );
  process.exit(1);
}

console.log(
  `[tauri-build-safe] ${applicationsDir} BacksterOS apps unchanged. Artifact is under src-tauri/target/release/bundle/`,
);
