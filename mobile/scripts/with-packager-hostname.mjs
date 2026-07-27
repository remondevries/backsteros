#!/usr/bin/env node
/**
 * Run a command with REACT_NATIVE_PACKAGER_HOSTNAME set so physical iOS
 * devices (esp. over Tailscale) get a reachable Metro URL instead of a
 * LAN IP that forces "Enter URL manually" in the Expo Dev Client.
 *
 * Preference order:
 *   1. REACT_NATIVE_PACKAGER_HOSTNAME (already set)
 *   2. EXPO_PUBLIC_PACKAGER_HOSTNAME from env / .env
 *   3. Hostname from EXPO_PUBLIC_API_URL when it is not loopback
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(resolve(root, ".env"));

function hostnameFromApiUrl(apiUrl) {
  if (!apiUrl?.trim()) return null;
  try {
    const host = new URL(apiUrl.trim()).hostname;
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

const hostname =
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME?.trim() ||
  process.env.EXPO_PUBLIC_PACKAGER_HOSTNAME?.trim() ||
  hostnameFromApiUrl(process.env.EXPO_PUBLIC_API_URL) ||
  null;

if (hostname) {
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = hostname;
  console.log(`[packager] REACT_NATIVE_PACKAGER_HOSTNAME=${hostname}`);
} else {
  console.log(
    "[packager] No Tailscale/LAN hostname configured — Dev Client may ask for a URL on device.",
  );
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/with-packager-hostname.mjs <command> [args...]");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
