/**
 * Desktop macOS packaging helpers: Info.plist marketing/build versions,
 * versioned install paths, and a snapshot of /Applications so `tauri build`
 * cannot clobber the installed app.
 */

import fs from "node:fs";
import path from "node:path";

export const STABLE_APP_NAME = "BacksterOS.app";

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
 * @param {string} xml
 * @param {string} version
 */
export function applyInfoPlistVersions(xml, version) {
  let next = setPlistString(xml, "CFBundleShortVersionString", version);
  next = setPlistString(next, "CFBundleVersion", version);
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
export function rollbackAppName(now) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  return `BacksterOS-rollback-${stamp}.app`;
}

/**
 * @param {{
 *   applicationsDir?: string,
 *   version: string,
 *   replaceStable?: boolean,
 *   stableExists?: boolean,
 *   now?: Date,
 * }} opts
 */
export function planMacosInstall(opts) {
  const applicationsDir = opts.applicationsDir ?? "/Applications";
  const replaceStable = Boolean(opts.replaceStable);
  const now = opts.now ?? new Date();
  const versionedDest = path.join(applicationsDir, versionedAppName(opts.version));
  const stableDest = path.join(applicationsDir, STABLE_APP_NAME);
  /** @type {Array<{ action: "copy", role: "versioned" | "rollback" | "stable", dest: string, source: "built" | "stable" | "versioned" }>} */
  const steps = [{ action: "copy", role: "versioned", dest: versionedDest, source: "built" }];
  if (replaceStable && opts.stableExists) {
    steps.push({
      action: "copy",
      role: "rollback",
      dest: path.join(applicationsDir, rollbackAppName(now)),
      source: "stable",
    });
  }
  if (replaceStable) {
    steps.push({ action: "copy", role: "stable", dest: stableDest, source: "versioned" });
  }
  return { versionedDest, stableDest, steps };
}

/**
 * @param {string} appPath
 */
export function snapshotAppBundle(appPath) {
  if (!fs.existsSync(appPath)) {
    return { exists: false, path: appPath, mtimeMs: null, size: null, ino: null };
  }
  const st = fs.statSync(appPath);
  return {
    exists: true,
    path: appPath,
    mtimeMs: st.mtimeMs,
    size: st.size,
    ino: st.ino,
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
  return (
    before.exists !== after.exists ||
    before.mtimeMs !== after.mtimeMs ||
    before.size !== after.size ||
    before.ino !== after.ino
  );
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
    const left = before.apps[name] ?? { exists: false, path: name, mtimeMs: null, size: null, ino: null };
    const right = after.apps[name] ?? { exists: false, path: name, mtimeMs: null, size: null, ino: null };
    if (appBundleChanged(left, right)) {
      changes.push(name);
    }
  }
  return changes.sort();
}
