#!/usr/bin/env node
/**
 * Sync desktop app version from package.json → tauri.conf.json, Cargo.toml,
 * Cargo.lock, and src-tauri/Info.plist (CFBundleShortVersionString /
 * CFBundleVersion). Does not rewrite files that already match (keeps the tree
 * clean across builds). Override with DESKTOP_APP_VERSION=x.y.z.
 *
 * Signing: set APPLE_SIGNING_IDENTITY to a Developer ID Application identity
 * when one is available. Apple Development alone cannot notarize distribution builds.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyInfoPlistVersions } from "./macos-packaging.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pkgPath = path.join(desktopRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const version =
  process.env.DESKTOP_APP_VERSION?.trim() ||
  (typeof pkg.version === "string" && pkg.version.trim() ? pkg.version.trim() : null);

if (!version) {
  console.error("[sync-app-version] package.json has no version and DESKTOP_APP_VERSION is unset");
  process.exit(1);
}

let wrote = false;

if (pkg.version !== version) {
  pkg.version = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  wrote = true;
}

const tauriPath = path.join(desktopRoot, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauri.bundle ??= {};
tauri.bundle.macOS ??= {};
const identity = process.env.APPLE_SIGNING_IDENTITY?.trim();
let tauriChanged = tauri.version !== version;
if (tauri.version !== version) {
  tauri.version = version;
}
if (identity) {
  if (tauri.bundle.macOS.signingIdentity !== identity) {
    tauri.bundle.macOS.signingIdentity = identity;
    tauriChanged = true;
  }
} else if (tauri.bundle.macOS.signingIdentity != null) {
  delete tauri.bundle.macOS.signingIdentity;
  tauriChanged = true;
}
if (tauriChanged) {
  fs.writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);
  wrote = true;
}

const cargoPath = path.join(desktopRoot, "src-tauri", "Cargo.toml");
let cargo = fs.readFileSync(cargoPath, "utf8");
const nextCargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
if (nextCargo !== cargo) {
  fs.writeFileSync(cargoPath, nextCargo);
  wrote = true;
  cargo = nextCargo;
}

const plistPath = path.join(desktopRoot, "src-tauri", "Info.plist");
if (fs.existsSync(plistPath)) {
  const plist = fs.readFileSync(plistPath, "utf8");
  const nextPlist = applyInfoPlistVersions(plist, version);
  if (nextPlist !== plist) {
    fs.writeFileSync(plistPath, nextPlist);
    wrote = true;
  }
}

const lockPath = path.join(desktopRoot, "src-tauri", "Cargo.lock");
if (fs.existsSync(lockPath)) {
  let lock = fs.readFileSync(lockPath, "utf8");
  const nextLock = lock.replace(
    /(name = "backsteros-desktop"\n)version = "[^"]+"/,
    `$1version = "${version}"`,
  );
  if (nextLock !== lock) {
    fs.writeFileSync(lockPath, nextLock);
    wrote = true;
  }
}

console.log(
  `[sync-app-version] ${version}${identity ? ` signed as ${identity}` : " (no Developer ID identity set)"}${wrote ? "" : " (already in sync)"}`,
);
