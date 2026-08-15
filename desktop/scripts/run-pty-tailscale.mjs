#!/usr/bin/env node
/**
 * Start the PTY sidecar bound for Tailscale (iPad / phone).
 * Loads AGENT_PTY_AUTH_TOKEN from core/server/.env when PTY_AUTH_TOKEN is unset.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const coreEnvPath = path.resolve(desktopRoot, "../core/server/.env");

function readEnvToken(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const match = text.match(/^AGENT_PTY_AUTH_TOKEN=(.+)$/m);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

const token =
  (process.env.PTY_AUTH_TOKEN || "").trim() || readEnvToken(coreEnvPath);

if (!token) {
  console.error(
    "[pty:tailscale] Set PTY_AUTH_TOKEN or AGENT_PTY_AUTH_TOKEN in core/server/.env",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  PTY_HOST: process.env.PTY_HOST?.trim() || "0.0.0.0",
  PTY_AUTH_TOKEN: token,
};

// Finder/Dock-launched Hub has a tiny PATH; ensure Cursor Agent CLI is findable.
const home = process.env.HOME || "";
if (home) {
  const extras = [
    path.join(home, ".local/bin"),
    path.join(home, "Library/pnpm"),
    path.join(home, ".cargo/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const current = env.PATH || process.env.PATH || "";
  const parts = current.split(":").filter(Boolean);
  for (const extra of extras.reverse()) {
    if (!parts.includes(extra)) parts.unshift(extra);
  }
  env.PATH = parts.join(":");
}

const child = spawn(
  process.execPath,
  [
    path.join(__dirname, "fix-node-pty-perms.mjs"),
  ],
  { cwd: desktopRoot, env, stdio: "inherit" },
);

child.on("exit", (code) => {
  if (code !== 0 && code !== null) process.exit(code);
  const server = spawn(process.execPath, [path.join(__dirname, "pty-server.mjs")], {
    cwd: desktopRoot,
    env,
    stdio: "inherit",
  });
  server.on("exit", (serverCode) => {
    process.exit(serverCode ?? 0);
  });
});
