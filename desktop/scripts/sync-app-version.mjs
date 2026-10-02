#!/usr/bin/env node
/**
 * Sync desktop app version across package.json, tauri.conf.json, and Cargo.toml.
 *
 * Default: 0.2.<git-rev-list-count> (leaves the shipped 0.1.0 placeholder behind).
 * Override with DESKTOP_APP_VERSION=x.y.z.
 *
 * Signing: set APPLE_SIGNING_IDENTITY to a Developer ID Application identity
 * when one is available. Apple Development alone cannot notarize distribution builds.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");

function gitCommitCount() {
  try {
    return execSync("git rev-list --count HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "0";
  }
}

const version =
  process.env.DESKTOP_APP_VERSION?.trim() || `0.2.${gitCommitCount()}`;

const pkgPath = path.join(desktopRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const tauriPath = path.join(desktopRoot, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauri.version = version;
tauri.bundle ??= {};
tauri.bundle.macOS ??= {};
const identity = process.env.APPLE_SIGNING_IDENTITY?.trim();
if (identity) {
  tauri.bundle.macOS.signingIdentity = identity;
} else {
  delete tauri.bundle.macOS.signingIdentity;
}
fs.writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);

const cargoPath = path.join(desktopRoot, "src-tauri", "Cargo.toml");
let cargo = fs.readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);

console.log(`[sync-app-version] ${version}${identity ? ` signed as ${identity}` : " (no Developer ID identity set)"}`);
