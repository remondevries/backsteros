#!/usr/bin/env node
/**
 * Copy a built BacksterOS.app to a versioned path under /Applications using a
 * fresh temp sibling + rename (never ditto/cp onto an existing .app).
 * --replace-stable promotes that versioned copy; it does not recopy the build.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUNDLE_EXECUTABLE_FALLBACK,
  interpretCodesignVerify,
  macosInstallPaths,
  readPlistString,
  STABLE_APP_NAME,
} from "./macos-packaging.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Copy onto a path that must not already exist (temp sibling).
 * @param {string} src
 * @param {string} dest
 */
export function copyAppBundle(src, dest) {
  if (fs.existsSync(dest)) {
    throw new Error(`refusing to copy onto existing ${dest}`);
  }
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
 * @param {string} appPath
 */
export function defaultRunCodesign(appPath) {
  if (process.platform !== "darwin") {
    return { verifyStatus: 0, verifyStderr: "", displayOutput: "Signature=adhoc" };
  }
  const verify = spawnSync("codesign", ["--verify", "--deep", "--strict", appPath], {
    encoding: "utf8",
  });
  const display = spawnSync("codesign", ["-dv", "--verbose=2", appPath], { encoding: "utf8" });
  return {
    verifyStatus: verify.status ?? 1,
    verifyStderr: `${verify.stderr ?? ""}${verify.stdout ?? ""}`,
    displayOutput: `${display.stderr ?? ""}${display.stdout ?? ""}`,
  };
}

/**
 * @param {string} appPath
 * @param {{
 *   version: string,
 *   runCodesign?: (appPath: string) => {
 *     verifyStatus: number | null,
 *     verifyStderr?: string,
 *     displayOutput?: string,
 *   },
 *   readFile?: (p: string) => string,
 *   exists?: (p: string) => boolean,
 * }} opts
 */
export function verifyMacosAppBundle(appPath, opts) {
  const exists = opts.exists ?? ((p) => fs.existsSync(p));
  const readFile = opts.readFile ?? ((p) => fs.readFileSync(p, "utf8"));
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  if (!exists(plistPath)) {
    throw new Error(`missing ${plistPath}`);
  }
  const xml = readFile(plistPath);
  const short = readPlistString(xml, "CFBundleShortVersionString");
  if (short !== opts.version) {
    throw new Error(
      `CFBundleShortVersionString is ${short == null ? "(missing)" : JSON.stringify(short)}, expected ${JSON.stringify(opts.version)}`,
    );
  }
  const exe = readPlistString(xml, "CFBundleExecutable") || BUNDLE_EXECUTABLE_FALLBACK;
  const exePath = path.join(appPath, "Contents", "MacOS", exe);
  if (!exists(exePath)) {
    throw new Error(`missing executable ${exePath}`);
  }
  const runCodesign = opts.runCodesign ?? defaultRunCodesign;
  const interpreted = interpretCodesignVerify(runCodesign(appPath));
  if (!interpreted.ok) {
    throw new Error(`codesign --verify --deep --strict failed: ${interpreted.error}`);
  }
  return interpreted;
}

/**
 * @param {(args?: string[]) => { status: number | null }} [runPgrep]
 */
export function isBacksterOsRunning(runPgrep) {
  const run =
    runPgrep ??
    (() => spawnSync("pgrep", ["-x", "BacksterOS"], { encoding: "utf8" }));
  return (run(["-x", "BacksterOS"]).status ?? 1) === 0;
}

/**
 * @typedef {{
 *   exists: (p: string) => boolean,
 *   copyBundle: (src: string, dest: string) => void,
 *   rename: (from: string, to: string) => void,
 *   rm: (p: string) => void,
 *   verifyBundle: typeof verifyMacosAppBundle,
 *   isRunning: () => boolean,
 *   runCodesign?: Parameters<typeof verifyMacosAppBundle>[1]["runCodesign"],
 * }} InstallFs
 */

/**
 * @param {Partial<InstallFs>} [overrides]
 * @returns {InstallFs}
 */
function installIo(overrides = {}) {
  return {
    exists: overrides.exists ?? ((p) => fs.existsSync(p)),
    copyBundle: overrides.copyBundle ?? copyAppBundle,
    rename: overrides.rename ?? ((from, to) => fs.renameSync(from, to)),
    rm: overrides.rm ?? ((p) => fs.rmSync(p, { recursive: true, force: true })),
    verifyBundle: overrides.verifyBundle ?? verifyMacosAppBundle,
    isRunning: overrides.isRunning ?? (() => isBacksterOsRunning()),
    runCodesign: overrides.runCodesign,
  };
}

/**
 * @param {{
 *   builtAppPath?: string,
 *   applicationsDir?: string,
 *   version: string,
 *   replaceStable?: boolean,
 *   force?: boolean,
 *   now?: Date,
 * } & Partial<InstallFs>} opts
 */
export function installMacosApp(opts) {
  const replaceStable = Boolean(opts.replaceStable);
  const force = Boolean(opts.force);
  const now = opts.now ?? new Date();
  const io = installIo(opts);
  const paths = macosInstallPaths({
    applicationsDir: opts.applicationsDir,
    version: opts.version,
    now,
  });
  const { applicationsDir, versionedDest, stableDest, rollbackDest, tmpDest, asideDest } = paths;
  fs.mkdirSync(applicationsDir, { recursive: true });

  let copiedFromBuild = false;
  if (!replaceStable) {
    const builtAppPath = opts.builtAppPath;
    if (!builtAppPath || !io.exists(builtAppPath)) {
      throw new Error(
        `Built app not found at ${builtAppPath ?? "(unset)"}. Run \`pnpm --filter @backsteros/desktop build\` first (that command does not install into /Applications).`,
      );
    }
    if (io.exists(versionedDest) && !force) {
      throw new Error(
        `${versionedDest} already exists; pass --force to move it aside and replace (never merge)`,
      );
    }
    if (io.exists(tmpDest)) io.rm(tmpDest);
    try {
      io.copyBundle(builtAppPath, tmpDest);
      io.verifyBundle(tmpDest, { version: opts.version, runCodesign: io.runCodesign, exists: io.exists });
    } catch (err) {
      if (io.exists(tmpDest)) io.rm(tmpDest);
      throw err;
    }
    if (io.exists(versionedDest)) {
      io.rename(versionedDest, asideDest);
    }
    io.rename(tmpDest, versionedDest);
    copiedFromBuild = true;
  }

  if (!replaceStable) {
    return { ...paths, copiedFromBuild, promoted: false, adHoc: false };
  }

  if (!io.exists(versionedDest)) {
    throw new Error(
      `missing versioned copy ${versionedDest}; run install without --replace-stable first`,
    );
  }
  if (io.isRunning() && !force) {
    throw new Error("BacksterOS is running; quit it or pass --force");
  }

  const verified = io.verifyBundle(versionedDest, {
    version: opts.version,
    runCodesign: io.runCodesign,
    exists: io.exists,
  });

  const stableExisted = io.exists(stableDest);
  if (stableExisted) {
    io.rename(stableDest, rollbackDest);
  }
  try {
    io.rename(versionedDest, stableDest);
  } catch (err) {
    if (stableExisted && io.exists(rollbackDest) && !io.exists(stableDest)) {
      try {
        io.rename(rollbackDest, stableDest);
      } catch (restoreErr) {
        const restoreMsg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
        throw new Error(
          `failed to promote ${versionedDest} onto ${stableDest} (${err instanceof Error ? err.message : err}); also failed to restore rollback: ${restoreMsg}`,
        );
      }
    }
    throw err;
  }

  return {
    ...paths,
    copiedFromBuild,
    promoted: true,
    adHoc: Boolean(verified?.adHoc),
  };
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
  let force = process.env.INSTALL_FORCE === "1";
  let applicationsDir = process.env.INSTALL_APPLICATIONS_DIR?.trim() || "/Applications";
  let builtAppPath = process.env.INSTALL_BUILT_APP?.trim() || defaultBuiltAppPath();
  for (const arg of argv) {
    if (arg === "--replace-stable") replaceStable = true;
    else if (arg === "--force") force = true;
    else if (arg.startsWith("--applications-dir=")) applicationsDir = arg.slice("--applications-dir=".length);
    else if (arg.startsWith("--built-app=")) builtAppPath = arg.slice("--built-app=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/install-macos-app.mjs [--replace-stable] [--force]
  Copies the built bundle to a temp sibling, verifies, then renames to
  /Applications/BacksterOS-<version>.app (refuses if that path exists unless --force).
  --replace-stable  promote that versioned copy to BacksterOS.app via rename
                    (does not recopy the build). Verifies codesign, version, and
                    executable first. Refuses while BacksterOS is running unless --force.
  --force           replace an existing versioned copy (moved aside, not merged)
                    and/or swap while the app is running
`);
      process.exit(0);
    }
  }
  return { replaceStable, force, applicationsDir, builtAppPath };
}

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry) && path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const { replaceStable, force, applicationsDir, builtAppPath } = parseArgs(process.argv.slice(2));
  const version = process.env.DESKTOP_APP_VERSION?.trim() || readDesktopVersion();
  const plan = installMacosApp({
    builtAppPath,
    applicationsDir,
    version,
    replaceStable,
    force,
  });
  console.log(`[install-macos-app] versioned copy: ${plan.versionedDest}`);
  if (plan.adHoc) {
    console.warn("[install-macos-app] versioned copy is ad-hoc signed (Developer ID is OS-86)");
  }
  if (replaceStable) {
    console.log(`[install-macos-app] stable app: ${plan.stableDest}`);
  } else {
    console.log(
      `[install-macos-app] left ${path.join(applicationsDir, STABLE_APP_NAME)} untouched; pass --replace-stable to promote the versioned copy`,
    );
  }
}
