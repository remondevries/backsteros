/**
 * Desktop macOS packaging helpers: Info.plist marketing/build versions,
 * versioned install paths, and a snapshot of /Applications so `tauri build`
 * cannot clobber the installed app.
 */

import fs from "node:fs";
import path from "node:path";

export const STABLE_APP_NAME = "BacksterOS.app";
export const BUNDLE_EXECUTABLE_FALLBACK = "BacksterOS";

const SNAPSHOT_FIXED_FILES = [
  path.join("Contents", "Info.plist"),
  path.join("Contents", "_CodeSignature", "CodeResources"),
];

/**
 * @param {string} xml
 * @param {string} key
 * @param {string} value
 */
export function setPlistString(xml, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`(<key>${escapedKey}</key>\\s*<string>)([^<]*)(</string>)`);
  if (block.test(xml)) {
    return xml.replace(block, `$1${value}$3`);
  }
  const insert = `\t<key>${key}</key>\n\t<string>${value}</string>\n`;
  const idx = xml.lastIndexOf("</dict>");
  if (idx === -1) {
    throw new Error("Info.plist is missing a closing </dict>");
  }
  return `${xml.slice(0, idx)}${insert}${xml.slice(idx)}`;
}

/**
 * Apple CFBundleVersion is a period-separated integer list. Strip semver
 * pre-release / build metadata (`0.2.271-beta.1+1` → `0.2.271`).
 *
 * @param {string} version
 */
export function appleBundleVersion(version) {
  const core = version.trim().split("+")[0].split("-")[0];
  if (!/^\d+(\.\d+)*$/.test(core)) {
    throw new Error(`cannot derive CFBundleVersion from ${JSON.stringify(version)}`);
  }
  return core;
}

/**
 * @param {string} xml
 * @param {string} key
 */
export function readPlistString(xml, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<key>${escapedKey}</key>\\s*<string>([^<]*)</string>`));
  return match ? match[1] : null;
}

/**
 * @param {string} xml
 * @param {string} version
 */
export function applyInfoPlistVersions(xml, version) {
  const marketing = version.trim();
  let next = setPlistString(xml, "CFBundleShortVersionString", marketing);
  next = setPlistString(next, "CFBundleVersion", appleBundleVersion(marketing));
  return next;
}

/**
 * @param {string} version
 */
export function versionedAppName(version) {
  return `BacksterOS-${version}.app`;
}

/**
 * @param {Date} now
 */
export function compactTimestamp(now) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

/**
 * @param {Date} now
 */
export function rollbackAppName(now) {
  return `BacksterOS-rollback-${compactTimestamp(now)}.app`;
}

/**
 * @param {string} version
 * @param {Date} now
 */
export function versionedTempAppName(version, now) {
  return `.BacksterOS-${version}.app.tmp-${compactTimestamp(now)}`;
}

/**
 * @param {string} version
 * @param {Date} now
 */
export function versionedAsideAppName(version, now) {
  return `.BacksterOS-${version}.app.aside-${compactTimestamp(now)}`;
}

/**
 * Default `tauri build --bundles app` only on macOS so Windows CI still
 * produces msi/nsis from tauri.conf.json targets.
 *
 * @param {string[]} args
 * @param {NodeJS.Platform} [platform]
 */
export function withDefaultTauriBundles(args, platform = process.platform) {
  const hasBundles = args.some((a) => a === "--bundles" || a.startsWith("--bundles="));
  if (!hasBundles && platform === "darwin") {
    return [...args, "--bundles", "app"];
  }
  return [...args];
}

/**
 * @param {{
 *   applicationsDir?: string,
 *   version: string,
 *   now?: Date,
 * }} opts
 */
export function macosInstallPaths(opts) {
  const applicationsDir = opts.applicationsDir ?? "/Applications";
  const now = opts.now ?? new Date();
  return {
    applicationsDir,
    versionedDest: path.join(applicationsDir, versionedAppName(opts.version)),
    stableDest: path.join(applicationsDir, STABLE_APP_NAME),
    rollbackDest: path.join(applicationsDir, rollbackAppName(now)),
    tmpDest: path.join(applicationsDir, versionedTempAppName(opts.version, now)),
    asideDest: path.join(applicationsDir, versionedAsideAppName(opts.version, now)),
  };
}

/**
 * @param {string} filePath
 * @returns {{ exists: boolean, mtimeMs: number | null, size: number | null }}
 */
function snapshotFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, mtimeMs: null, size: null };
  }
  const st = fs.statSync(filePath);
  if (!st.isFile()) {
    return { exists: false, mtimeMs: null, size: null };
  }
  return { exists: true, mtimeMs: st.mtimeMs, size: st.size };
}

/**
 * @param {string} appPath
 */
export function snapshotAppBundle(appPath) {
  if (!fs.existsSync(appPath)) {
    return { exists: false, path: appPath, mtimeMs: null, size: null, ino: null, files: {} };
  }
  const st = fs.statSync(appPath);
  /** @type {Record<string, ReturnType<typeof snapshotFile>>} */
  const files = {};
  for (const rel of SNAPSHOT_FIXED_FILES) {
    files[rel] = snapshotFile(path.join(appPath, rel));
  }
  const macosDir = path.join(appPath, "Contents", "MacOS");
  if (fs.existsSync(macosDir) && fs.statSync(macosDir).isDirectory()) {
    for (const name of fs.readdirSync(macosDir).sort()) {
      const rel = path.join("Contents", "MacOS", name);
      files[rel] = snapshotFile(path.join(appPath, rel));
    }
  }
  return {
    exists: true,
    path: appPath,
    mtimeMs: st.mtimeMs,
    size: st.size,
    ino: st.ino,
    files,
  };
}

/**
 * @param {string} applicationsDir
 */
export function snapshotBacksterApps(applicationsDir) {
  if (!fs.existsSync(applicationsDir)) {
    return { dirExists: false, apps: {} };
  }
  /** @type {Record<string, ReturnType<typeof snapshotAppBundle>>} */
  const apps = {};
  for (const name of fs.readdirSync(applicationsDir)) {
    if (!name.startsWith("BacksterOS") || !name.endsWith(".app")) continue;
    apps[name] = snapshotAppBundle(path.join(applicationsDir, name));
  }
  return { dirExists: true, apps };
}

/**
 * @param {ReturnType<typeof snapshotAppBundle>} before
 * @param {ReturnType<typeof snapshotAppBundle>} after
 */
export function appBundleChanged(before, after) {
  if (
    before.exists !== after.exists ||
    before.mtimeMs !== after.mtimeMs ||
    before.size !== after.size ||
    before.ino !== after.ino
  ) {
    return true;
  }
  const names = new Set([...Object.keys(before.files ?? {}), ...Object.keys(after.files ?? {})]);
  for (const name of names) {
    const left = before.files?.[name] ?? { exists: false, mtimeMs: null, size: null };
    const right = after.files?.[name] ?? { exists: false, mtimeMs: null, size: null };
    if (left.exists !== right.exists || left.mtimeMs !== right.mtimeMs || left.size !== right.size) {
      return true;
    }
  }
  return false;
}

/**
 * @param {ReturnType<typeof snapshotBacksterApps>} before
 * @param {ReturnType<typeof snapshotBacksterApps>} after
 * @returns {string[]}
 */
export function describeBacksterAppChanges(before, after) {
  const names = new Set([...Object.keys(before.apps), ...Object.keys(after.apps)]);
  const changes = [];
  for (const name of names) {
    const empty = { exists: false, path: name, mtimeMs: null, size: null, ino: null, files: {} };
    const left = before.apps[name] ?? empty;
    const right = after.apps[name] ?? empty;
    if (appBundleChanged(left, right)) {
      changes.push(name);
    }
  }
  return changes.sort();
}

/**
 * @param {{
 *   verifyStatus: number | null,
 *   verifyStderr?: string,
 *   displayOutput?: string,
 * }} result
 */
export function interpretCodesignVerify(result) {
  if ((result.verifyStatus ?? 1) === 0) {
    return { ok: true, adHoc: false };
  }
  const display = result.displayOutput ?? "";
  const adHoc = /Signature=adhoc|\(adhoc\)|flags=.*adhoc/i.test(display);
  if (adHoc) {
    return { ok: true, adHoc: true };
  }
  return { ok: false, adHoc: false, error: (result.verifyStderr ?? "").trim() || "codesign --verify failed" };
}
