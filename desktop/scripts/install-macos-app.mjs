#!/usr/bin/env node
/**
 * Copy a built BacksterOS.app to a versioned path under /Applications.
 * Never run this from `tauri build`. Optional --replace-stable snapshots the
 * live /Applications/BacksterOS.app to a timestamped rollback first.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planMacosInstall, STABLE_APP_NAME } from "./macos-packaging.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string} src
 * @param {string} dest
 */
export function copyAppBundle(src, dest) {
  if (process.platform === "darwin") {
    const result = spawnSync("ditto", [src, dest], { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`ditto failed copying ${src} → ${dest} (exit ${result.status})`);
    }
    return;
  }
  fs.cpSync(src, dest, { recursive: true });
}

/**
 * @param {{
 *   builtAppPath: string,
 *   applicationsDir?: string,
 *   version: string,
 *   replaceStable?: boolean,
 *   copyBundle?: (src: string, dest: string) => void,
 *   exists?: (p: string) => boolean,
 *   now?: Date,
 * }} opts
 */
export function installMacosApp(opts) {
  const exists = opts.exists ?? ((p) => fs.existsSync(p));
  const copyBundle = opts.copyBundle ?? copyAppBundle;
  const applicationsDir = opts.applicationsDir ?? "/Applications";
  const builtAppPath = opts.builtAppPath;
  if (!exists(builtAppPath)) {
    throw new Error(
      `Built app not found at ${builtAppPath}. Run \`pnpm --filter @backsteros/desktop build\` first (that command does not install into /Applications).`,
    );
  }
  const stableDest = path.join(applicationsDir, STABLE_APP_NAME);
  const plan = planMacosInstall({
    applicationsDir,
    version: opts.version,
    replaceStable: opts.replaceStable,
    stableExists: exists(stableDest),
    now: opts.now,
  });
  const resolved = {
    built: builtAppPath,
    versioned: plan.versionedDest,
    stable: stableDest,
  };
  for (const step of plan.steps) {
    const src = resolved[step.source];
    copyBundle(src, step.dest);
  }
  return plan;
}

function readDesktopVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8"));
  const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
  if (!version) {
    throw new Error("desktop/package.json has no version");
  }
  return version;
}

function defaultBuiltAppPath() {
  return path.join(desktopRoot, "src-tauri", "target", "release", "bundle", "macos", STABLE_APP_NAME);
}

function parseArgs(argv) {
  let replaceStable = process.env.INSTALL_REPLACE_STABLE === "1";
  let applicationsDir = process.env.INSTALL_APPLICATIONS_DIR?.trim() || "/Applications";
  let builtAppPath = process.env.INSTALL_BUILT_APP?.trim() || defaultBuiltAppPath();
  for (const arg of argv) {
    if (arg === "--replace-stable") replaceStable = true;
    else if (arg.startsWith("--applications-dir=")) applicationsDir = arg.slice("--applications-dir=".length);
    else if (arg.startsWith("--built-app=")) builtAppPath = arg.slice("--built-app=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/install-macos-app.mjs [--replace-stable]
  Copies the built bundle to /Applications/BacksterOS-<version>.app.
  --replace-stable  also copies that onto /Applications/BacksterOS.app after
                    saving any existing stable app as BacksterOS-rollback-<timestamp>.app
`);
      process.exit(0);
    }
  }
  return { replaceStable, applicationsDir, builtAppPath };
}

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry) && path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const { replaceStable, applicationsDir, builtAppPath } = parseArgs(process.argv.slice(2));
  const version = process.env.DESKTOP_APP_VERSION?.trim() || readDesktopVersion();
  const plan = installMacosApp({
    builtAppPath,
    applicationsDir,
    version,
    replaceStable,
  });
  console.log(`[install-macos-app] versioned copy: ${plan.versionedDest}`);
  if (replaceStable) {
    console.log(`[install-macos-app] stable app: ${plan.stableDest}`);
  } else {
    console.log(
      `[install-macos-app] left ${path.join(applicationsDir, STABLE_APP_NAME)} untouched; pass --replace-stable to swap it after a rollback copy`,
    );
  }
}
