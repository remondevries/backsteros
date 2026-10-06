#!/usr/bin/env node
/**
 * Load Apple signing/notarization env from ~/.config/secrets (never from git),
 * then exec a command. Used by desktop, hub, and the Dynamic Island helper:
 *
 *   node desktop/scripts/with-apple-signing.mjs -- pnpm --filter @backsteros/desktop build
 *   node desktop/scripts/with-apple-signing.mjs -- pnpm --filter @backsteros/hub build
 *   node /path/to/Codebase/desktop/scripts/with-apple-signing.mjs -- npm run build:app
 *
 * Existing environment variables win over the secrets file.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  APPLE_SIGNING_ENV_FILES,
  mergeEnvFromFiles,
  redactedEnvSummary,
  resolveAppleSigning,
} from "./apple-signing.mjs";

function expandHome(p) {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

const dash = process.argv.indexOf("--");
const command = dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);
if (command.length === 0) {
  console.error("Usage: with-apple-signing.mjs -- <command> [args…]");
  process.exit(1);
}

const fileContents = APPLE_SIGNING_ENV_FILES.map((rel) => {
  const abs = expandHome(rel);
  return {
    path: abs,
    text: fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null,
  };
});

const merged = mergeEnvFromFiles(process.env, fileContents);
const resolved = resolveAppleSigning(merged);

for (const note of resolved.notes) {
  console.log(`[apple-signing] ${note}`);
}
if (resolved.errors.length > 0) {
  for (const err of resolved.errors) {
    console.error(`[apple-signing] ${err}`);
  }
  process.exit(1);
}

const env = { ...process.env, ...merged };
if (resolved.signingIdentity) {
  env.APPLE_SIGNING_IDENTITY = resolved.signingIdentity;
}

const loaded = fileContents.filter((f) => f.text != null).map((f) => f.path);
if (loaded.length > 0) {
  console.log(`[apple-signing] loaded ${loaded.join(", ")}`);
}
for (const line of redactedEnvSummary(env)) {
  console.log(`[apple-signing] ${line}`);
}

const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  env,
  shell: false,
});
if (result.error) {
  console.error(`[apple-signing] failed to spawn ${command[0]}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
